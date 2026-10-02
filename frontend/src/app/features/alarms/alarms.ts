import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { catchError, of, switchMap, tap } from 'rxjs';
import { TankApi } from '../../core/api/tank-api';
import { downloadCsv } from '../../core/csv';
import {
  ALARM_LABELS,
  ALARM_SEVERITY,
  AlarmEvent,
  AlarmKind,
  AlarmSeverity,
  SEVERITY_LABELS,
  TANK_CODES,
  TankCode,
} from '../../core/models/tank.models';
import { ActiveAlarmsStore } from '../../core/state/active-alarms.store';
import { SystemStatusStore } from '../../core/state/system-status.store';
import { formatDuration, plural } from '../../core/time/duration';
import { PERIOD_OPTIONS, PeriodKey, resolveRange } from '../../core/time/periods';

type ViewMode = 'active' | 'history';

function newestFirst(a: AlarmEvent, b: AlarmEvent): number {
  return Date.parse(b.raisedAt) - Date.parse(a.raisedAt);
}

/** Attivi: prima gli allarmi, poi gli avvisi; a parità, i più recenti in alto. */
function byPriority(a: AlarmEvent, b: AlarmEvent): number {
  const sev = (e: AlarmEvent) => (ALARM_SEVERITY[e.kind] === 'alarm' ? 0 : 1);
  return sev(a) - sev(b) || newestFirst(a, b);
}

@Component({
  selector: 'app-alarms',
  imports: [FormsModule, DatePipe, RouterLink, TableModule, SelectButtonModule, SelectModule, DatePickerModule, ButtonModule],
  templateUrl: './alarms.html',
  styleUrl: './alarms.scss',
})
export class Alarms {
  private readonly api = inject(TankApi);
  protected readonly active = inject(ActiveAlarmsStore);
  private readonly clock = inject(SystemStatusStore);

  protected readonly modeOptions = [
    { label: 'Attivi', value: 'active' },
    { label: 'Storico', value: 'history' },
  ];
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly tankOptions = [
    { label: 'Tutti i serbatoi', value: null },
    ...TANK_CODES.map((c) => ({ label: `Serbatoio ${c}`, value: c })),
  ];
  protected readonly kindOptions = [
    { label: 'Tutti i tipi', value: null },
    ...(Object.keys(ALARM_LABELS) as AlarmKind[]).map((k) => ({ label: ALARM_LABELS[k], value: k })),
  ];

  protected readonly mode = signal<ViewMode>('active');
  protected readonly period = signal<PeriodKey>('7d');
  protected readonly customRange = signal<Date[] | null>(null);
  protected readonly tankCode = signal<TankCode | null>(null);
  protected readonly kind = signal<AlarmKind | null>(null);
  private readonly reload = signal(0);

  protected readonly history = signal<AlarmEvent[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal(false);

  /** Lo storico si interroga solo in modalità Storico; gli attivi arrivano dallo store in polling. */
  private readonly historyQuery = computed(() => {
    this.reload();
    if (this.mode() !== 'history') return null;
    const range = resolveRange(this.period(), this.customRange());
    if (!range) return null;
    return { activeOnly: false, from: range.from, to: range.to, tankCode: this.tankCode() ?? undefined };
  });

  constructor() {
    toObservable(this.historyQuery)
      .pipe(
        tap((q) => this.historyLoading.set(q !== null)),
        switchMap((q) =>
          q
            ? this.api.getAlarms(q).pipe(
                catchError(() => {
                  this.historyError.set(true);
                  return of(null);
                }),
              )
            : of(null),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((rows) => {
        this.historyLoading.set(false);
        if (rows) {
          this.history.set(rows);
          this.historyError.set(false);
        }
      });
  }

  protected readonly rows = computed(() => {
    const activeMode = this.mode() === 'active';
    const source = activeMode ? this.active.alarms() : this.history();
    const tank = this.tankCode();
    const kind = this.kind();
    return source
      .filter((e) => (tank === null || e.tankCode === tank) && (kind === null || e.kind === kind))
      .slice()
      .sort(activeMode ? byPriority : newestFirst);
  });

  protected readonly loading = computed(() =>
    this.mode() === 'active' ? !this.active.loaded() : this.historyLoading(),
  );
  protected readonly error = computed(() => (this.mode() === 'active' ? this.active.error() : this.historyError()));

  protected readonly customIncomplete = computed(
    () => this.mode() === 'history' && this.period() === 'custom' && !this.customRange()?.[1],
  );

  protected readonly plural = plural;

  protected severity(e: AlarmEvent): AlarmSeverity {
    return ALARM_SEVERITY[e.kind];
  }

  protected severityLabel(e: AlarmEvent): string {
    return SEVERITY_LABELS[ALARM_SEVERITY[e.kind]];
  }

  protected kindLabel(e: AlarmEvent): string {
    return ALARM_LABELS[e.kind];
  }

  /** Per gli eventi attivi la durata cresce con l'orologio della pagina. */
  protected duration(e: AlarmEvent): string {
    const end = e.clearedAt ? Date.parse(e.clearedAt) : this.clock.now();
    return formatDuration(end - Date.parse(e.raisedAt));
  }

  protected refresh(): void {
    if (this.mode() === 'active') this.active.reload();
    else this.reload.update((n) => n + 1);
  }

  protected exportCsv(): void {
    const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('it-IT') : '');
    downloadCsv(
      this.mode() === 'active' ? 'allarmi_attivi.csv' : 'storico_allarmi.csv',
      ['Gravità', 'Inizio', 'Fine', 'Durata', 'Serbatoio', 'Tipo', 'Descrizione'],
      this.rows().map((e) => [
        this.severityLabel(e),
        fmt(e.raisedAt),
        e.clearedAt ? fmt(e.clearedAt) : 'attivo',
        this.duration(e),
        e.tankCode ?? '',
        ALARM_LABELS[e.kind],
        e.message,
      ]),
    );
  }
}
