import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { catchError, forkJoin, of, switchMap, tap } from 'rxjs';
import { TankApi } from '../../core/api/tank-api';
import { downloadCsv } from '../../core/csv';
import { TANK_COLORS } from '../../core/models/tank-colors';
import { TANK_CODES, TankCode, TankHistory } from '../../core/models/tank.models';
import { PERIOD_OPTIONS, PeriodKey, resolveRange } from '../../core/time/periods';

type Unit = 'liters' | 'percent';

interface TankStats {
  code: TankCode;
  color: string;
  min: number | null;
  max: number | null;
  first: number | null;
  last: number | null;
}

const fmtDateTime = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtLiters = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const fmtPercent = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

@Component({
  selector: 'app-trends',
  imports: [FormsModule, NgxEchartsDirective, SelectButtonModule, DatePickerModule, ButtonModule, TableModule],
  templateUrl: './trends.html',
  styleUrl: './trends.scss',
})
export class Trends {
  private readonly api = inject(TankApi);

  protected readonly tankCodes = TANK_CODES;
  protected readonly colors = TANK_COLORS;
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly unitOptions = [
    { label: 'Litri', value: 'liters' },
    { label: '%', value: 'percent' },
  ];

  /** Default: produzione (A-B) e stoccaggio (G-H), i serbatoi coinvolti nel travaso. */
  protected readonly selected = signal<TankCode[]>(['A', 'B', 'G', 'H']);
  protected readonly unit = signal<Unit>('liters');
  protected readonly period = signal<PeriodKey>('24h');
  protected readonly customRange = signal<Date[] | null>(null);
  private readonly reload = signal(0);

  protected readonly histories = signal<TankHistory[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  private readonly request = computed(() => {
    this.reload();
    const range = resolveRange(this.period(), this.customRange());
    const codes = this.selected();
    return range && codes.length ? { codes, range } : null;
  });

  constructor() {
    toObservable(this.request)
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((req) => {
          if (!req) return of<TankHistory[]>([]);
          return forkJoin(req.codes.map((c) => this.api.getTankHistory(c, req.range.from, req.range.to))).pipe(
            catchError(() => {
              this.error.set(true);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (data) {
          this.histories.set(data);
          this.error.set(false);
        }
      });
  }

  protected isSelected(code: TankCode): boolean {
    return this.selected().includes(code);
  }

  protected toggle(code: TankCode): void {
    const current = this.selected();
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    // Ordine sempre A→H, indipendente dall'ordine dei clic.
    this.selected.set(TANK_CODES.filter((c) => next.includes(c)));
  }

  protected selectAll(): void {
    this.selected.set([...TANK_CODES]);
  }

  protected clearSelection(): void {
    this.selected.set([]);
  }

  protected refresh(): void {
    this.reload.update((n) => n + 1);
  }

  private value(s: { levelLiters: number | null; levelPercent: number | null }): number | null {
    return this.unit() === 'liters' ? s.levelLiters : s.levelPercent;
  }

  protected readonly stats = computed<TankStats[]>(() =>
    this.histories().map((h) => {
      const values = h.samples.map((s) => this.value(s)).filter((v): v is number => v !== null);
      return {
        code: h.code,
        color: TANK_COLORS[h.code],
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        first: values.length ? values[0] : null,
        last: values.length ? values[values.length - 1] : null,
      };
    }),
  );

  /** Soglie disegnate solo se uguali per tutti i serbatoi mostrati, altrimenti sarebbero fuorvianti. */
  private readonly sharedThresholds = computed(() => {
    const hs = this.histories();
    if (!hs.length) return [];
    const inUnit = (liters: number | null, capacity: number) =>
      liters === null ? null : this.unit() === 'liters' ? liters : Math.round((liters / capacity) * 1000) / 10;
    const pick = (get: (h: TankHistory) => number | null, label: string) => {
      const values = hs.map((h) => inUnit(get(h), h.capacityLiters));
      const first = values[0];
      return first !== null && values.every((v) => v === first) ? { value: first, label } : null;
    };
    return [
      pick((h) => h.thresholds.tooFullLiters, 'Troppo pieno'),
      pick((h) => h.thresholds.fillLiters, 'Pieno'),
      pick((h) => h.thresholds.lowWarningLiters, 'Liv. basso'),
      pick((h) => h.thresholds.lowStopLiters, 'Liv. minimo'),
    ].filter((t): t is { value: number; label: string } => t !== null);
  });

  protected formatValue(v: number | null): string {
    if (v === null) return '—';
    return this.unit() === 'liters' ? `${fmtLiters.format(v)} l` : `${fmtPercent.format(v)} %`;
  }

  protected readonly options = computed<EChartsCoreOption>(() => {
    const hs = this.histories();
    const liters = this.unit() === 'liters';
    const maxCapacity = Math.max(0, ...hs.map((h) => h.capacityLiters));
    const thresholds = this.sharedThresholds();
    const format = (v: number) => (liters ? `${fmtLiters.format(v)} l` : `${fmtPercent.format(v)} %`);

    return {
      animation: false,
      textStyle: { fontFamily: 'Segoe UI, Roboto, Arial, sans-serif' },
      grid: { left: 64, right: 96, top: 24, bottom: 64 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const ps = params as { seriesName: string; color: string; value: [number, number | null] }[];
          if (!ps.length) return '';
          const rows = ps
            .map(
              (p) =>
                `<span style="display:inline-block;width:10px;height:3px;margin:0 6px 3px 0;background:${p.color}"></span>` +
                `Serbatoio ${p.seriesName} <b style="float:right;margin-left:16px">${p.value[1] === null ? 'n.v.' : format(p.value[1])}</b>`,
            )
            .join('<br>');
          return `${fmtDateTime.format(ps[0].value[0])}<br>${rows}`;
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          hideOverlap: true,
          color: '#5b5b57',
          formatter: { year: '{yyyy}', month: '{MM}/{yyyy}', day: '{dd}/{MM}', hour: '{HH}:{mm}', minute: '{HH}:{mm}' },
        },
        axisLine: { lineStyle: { color: '#a9a9a4' } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: liters ? maxCapacity || undefined : 100,
        name: liters ? 'litri' : '%',
        nameTextStyle: { color: '#5b5b57' },
        axisLabel: { color: '#5b5b57', formatter: (v: number) => (liters ? fmtLiters.format(v) : String(v)) },
        splitLine: { lineStyle: { color: '#d4d4d0' } },
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        {
          type: 'slider',
          height: 20,
          bottom: 12,
          filterMode: 'none',
          labelFormatter: '',
          borderColor: '#a9a9a4',
          fillerColor: 'rgba(58, 74, 87, 0.15)',
          handleStyle: { color: '#ececea', borderColor: '#5b5b57' },
          moveHandleStyle: { color: '#a9a9a4' },
          dataBackground: { lineStyle: { color: '#8a8a85' }, areaStyle: { color: '#d4d4d0' } },
          selectedDataBackground: { lineStyle: { color: '#3a4a57' }, areaStyle: { color: 'rgba(111, 127, 140, 0.3)' } },
        },
      ],
      // Le linee convergono spesso: niente etichette a fine linea, l'identità la danno
      // i pulsanti-legenda sopra il grafico, il tooltip e la tabella di riepilogo.
      series: hs.map((h, i) => ({
        type: 'line',
        name: h.code,
        data: h.samples.map((s) => [Date.parse(s.timestamp), this.value(s)]),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 2, color: TANK_COLORS[h.code] },
        itemStyle: { color: TANK_COLORS[h.code] },
        emphasis: { focus: 'series' },
        // Soglie comuni: grigio neutro, per non confonderle con i colori dei serbatoi.
        markLine:
          i === 0 && thresholds.length
            ? {
                symbol: 'none',
                silent: true,
                lineStyle: { color: '#5b5b57', type: 'dashed', width: 1 },
                label: { position: 'end', formatter: '{b}', color: '#5b5b57', fontSize: 11 },
                data: thresholds.map((t) => ({ yAxis: t.value, name: t.label })),
              }
            : undefined,
      })),
    };
  });

  protected exportCsv(): void {
    const hs = this.histories();
    if (!hs.length) return;
    // Formato "largo": una riga per istante, una colonna per serbatoio.
    const byTime = new Map<string, Map<TankCode, number | null>>();
    for (const h of hs) {
      for (const s of h.samples) {
        if (!byTime.has(s.timestamp)) byTime.set(s.timestamp, new Map());
        byTime.get(s.timestamp)!.set(h.code, this.value(s));
      }
    }
    const times = [...byTime.keys()].sort();
    const unitLabel = this.unit() === 'liters' ? 'l' : '%';
    downloadCsv(
      `trend_serbatoi_${hs.map((h) => h.code).join('')}.csv`,
      ['Data e ora', ...hs.map((h) => `Serbatoio ${h.code} (${unitLabel})`)],
      times.map((t) => [new Date(t).toLocaleString('it-IT'), ...hs.map((h) => byTime.get(t)!.get(h.code) ?? null)]),
    );
  }
}
