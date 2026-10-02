import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { TankApi } from '../../core/api/tank-api';
import { downloadCsv } from '../../core/csv';
import { ALARM_LABELS, AlarmEvent, TankCode, TankHistory } from '../../core/models/tank.models';
import { tankCondition } from '../../core/models/tank-state';
import { SystemStatusStore } from '../../core/state/system-status.store';
import { PERIOD_OPTIONS, PeriodKey, TimeRange, resolveRange } from '../../core/time/periods';
import { LevelTrend } from '../../shared/level-trend/level-trend';
import { TankGauge } from '../../shared/tank-gauge/tank-gauge';

interface LoadState<T> {
  loading: boolean;
  value: T | null;
  error: boolean;
}

@Component({
  selector: 'app-tank-detail',
  imports: [
    FormsModule, RouterLink, DecimalPipe, DatePipe,
    SelectButtonModule, DatePickerModule, ButtonModule, TableModule,
    LevelTrend, TankGauge,
  ],
  templateUrl: './tank-detail.html',
  styleUrl: './tank-detail.scss',
})
export class TankDetail {
  private readonly api = inject(TankApi);
  private readonly store = inject(SystemStatusStore);

  /** Parametro di rotta /serbatoi/:code */
  readonly code = input.required<string>();

  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly period = signal<PeriodKey>('24h');
  protected readonly customRange = signal<Date[] | null>(null);
  /** Incrementato dal pulsante Aggiorna per rileggere lo storico. */
  private readonly reload = signal(0);

  protected readonly tankCode = computed(() => this.code().toUpperCase() as TankCode);
  protected readonly tank = computed(() => this.store.status()?.tanks.find((t) => t.code === this.tankCode()) ?? null);
  protected readonly condition = computed(() => {
    const t = this.tank();
    return t ? tankCondition(t) : 'invalid';
  });

  private readonly request = computed(() => {
    this.reload();
    const range = resolveRange(this.period(), this.customRange());
    return range ? { code: this.tankCode(), range } : null;
  });

  private readonly request$ = toObservable(this.request);

  protected readonly history = toSignal(
    this.request$.pipe(
      switchMap((req) =>
        req
          ? this.api.getTankHistory(req.code, req.range.from, req.range.to).pipe(
              map((value): LoadState<TankHistory> => ({ loading: false, value, error: false })),
              catchError(() => of<LoadState<TankHistory>>({ loading: false, value: null, error: true })),
              startWith<LoadState<TankHistory>>({ loading: true, value: null, error: false }),
            )
          : of<LoadState<TankHistory>>({ loading: false, value: null, error: false }),
      ),
    ),
    { initialValue: { loading: true, value: null, error: false } as LoadState<TankHistory> },
  );

  protected readonly events = toSignal(
    this.request$.pipe(
      switchMap((req) =>
        req
          ? this.api
              .getAlarms({ activeOnly: false, tankCode: req.code, from: req.range.from, to: req.range.to })
              .pipe(catchError(() => of<AlarmEvent[]>([])))
          : of<AlarmEvent[]>([]),
      ),
    ),
    { initialValue: [] as AlarmEvent[] },
  );

  protected readonly stats = computed(() => {
    const values = (this.history().value?.samples ?? [])
      .map((s) => s.levelLiters)
      .filter((v): v is number => v !== null);
    if (!values.length) return null;
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      first: values[0],
      last: values[values.length - 1],
    };
  });

  protected kindLabel(e: AlarmEvent): string {
    return ALARM_LABELS[e.kind];
  }

  protected refresh(): void {
    this.reload.update((n) => n + 1);
  }

  protected exportCsv(): void {
    const h = this.history().value;
    const range: TimeRange | null = resolveRange(this.period(), this.customRange());
    if (!h || !range) return;
    const stamp = (d: Date) => d.toISOString().slice(0, 16).replace(/[-:T]/g, '');
    downloadCsv(
      `serbatoio_${h.code}_${stamp(range.from)}_${stamp(range.to)}.csv`,
      ['Data e ora', 'Livello (l)', 'Livello (%)'],
      h.samples.map((s) => [new Date(s.timestamp).toLocaleString('it-IT'), s.levelLiters, s.levelPercent]),
    );
  }
}
