import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { TankApi } from '../../core/api/tank-api';
import { downloadCsv } from '../../core/csv';
import { ALARM_LABELS, AlarmEvent, TANK_CODES, TankCode } from '../../core/models/tank.models';
import { PERIOD_OPTIONS, PeriodKey, resolveRange } from '../../core/time/periods';

type ViewMode = 'active' | 'history';

@Component({
  selector: 'app-alarms',
  imports: [FormsModule, DatePipe, TableModule, SelectButtonModule, SelectModule, ButtonModule],
  templateUrl: './alarms.html',
  styleUrl: './alarms.scss',
})
export class Alarms {
  private readonly api = inject(TankApi);

  protected readonly modeOptions = [
    { label: 'Attivi', value: 'active' },
    { label: 'Storico', value: 'history' },
  ];
  protected readonly periodOptions = PERIOD_OPTIONS.filter((p) => p.value !== 'custom');
  protected readonly tankOptions = [
    { label: 'Tutti i serbatoi', value: null },
    ...TANK_CODES.map((c) => ({ label: `Serbatoio ${c}`, value: c })),
  ];

  protected readonly mode = signal<ViewMode>('active');
  protected readonly period = signal<PeriodKey>('7d');
  protected readonly tankCode = signal<TankCode | null>(null);
  private readonly reload = signal(0);

  private readonly query = computed(() => {
    this.reload();
    const active = this.mode() === 'active';
    const range = active ? null : resolveRange(this.period(), null);
    return {
      activeOnly: active,
      from: range?.from,
      to: range?.to,
      tankCode: this.tankCode() ?? undefined,
    };
  });

  protected readonly result = toSignal(
    toObservable(this.query).pipe(
      switchMap((q) =>
        this.api.getAlarms(q).pipe(
          map((rows) => ({ loading: false, rows, error: false })),
          catchError(() => of({ loading: false, rows: [] as AlarmEvent[], error: true })),
          startWith({ loading: true, rows: [] as AlarmEvent[], error: false }),
        ),
      ),
    ),
    { initialValue: { loading: true, rows: [] as AlarmEvent[], error: false } },
  );

  protected kindLabel(e: AlarmEvent): string {
    return ALARM_LABELS[e.kind];
  }

  protected refresh(): void {
    this.reload.update((n) => n + 1);
  }

  protected durationMin(e: AlarmEvent): number | null {
    if (!e.clearedAt) return null;
    return Math.round((Date.parse(e.clearedAt) - Date.parse(e.raisedAt)) / 60_000);
  }

  protected exportCsv(): void {
    const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('it-IT') : '');
    downloadCsv(
      'eventi_serbatoi.csv',
      ['Inizio', 'Fine', 'Serbatoio', 'Tipo', 'Descrizione'],
      this.result().rows.map((e) => [fmt(e.raisedAt), fmt(e.clearedAt), e.tankCode ?? '', ALARM_LABELS[e.kind], e.message]),
    );
  }
}
