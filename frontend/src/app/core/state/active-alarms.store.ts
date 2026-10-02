import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, of, timer } from 'rxjs';
import { TankApi } from '../api/tank-api';
import { AppConfigService } from '../config/app-config';
import { ALARM_SEVERITY, AlarmEvent } from '../models/tank.models';

/**
 * Allarmi attivi in polling, condivisi tra barra di stato, menu e pagina allarmi.
 * In caso di errore mantiene l'ultimo elenco valido.
 */
@Injectable({ providedIn: 'root' })
export class ActiveAlarmsStore {
  private readonly api = inject(TankApi);
  private readonly config = inject(AppConfigService).config;

  private readonly alarmsState = signal<AlarmEvent[]>([]);
  private readonly loadedState = signal(false);
  private readonly errorState = signal(false);

  readonly alarms = this.alarmsState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly count = computed(() => this.alarmsState().length);
  readonly alarmCount = computed(() => this.alarmsState().filter((a) => ALARM_SEVERITY[a.kind] === 'alarm').length);
  readonly warningCount = computed(() => this.count() - this.alarmCount());

  constructor() {
    timer(0, this.config.pollingIntervalMs)
      .pipe(
        exhaustMap(() =>
          this.api.getAlarms({ activeOnly: true }).pipe(
            catchError(() => {
              this.errorState.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((rows) => {
        if (rows) {
          this.alarmsState.set(rows);
          this.loadedState.set(true);
          this.errorState.set(false);
        }
      });
  }

  /** Rilettura immediata, fuori dal ciclo di polling. */
  reload(): void {
    this.api.getAlarms({ activeOnly: true }).subscribe({
      next: (rows) => {
        this.alarmsState.set(rows);
        this.loadedState.set(true);
        this.errorState.set(false);
      },
      error: () => this.errorState.set(true),
    });
  }
}
