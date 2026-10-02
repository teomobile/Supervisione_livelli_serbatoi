import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, exhaustMap, of, timer } from 'rxjs';
import { TankApi } from '../api/tank-api';
import { AppConfigService } from '../config/app-config';
import { SystemStatus, TankCode, ZoneCode } from '../models/tank.models';

/**
 * Stato del sinottico, aggiornato in polling.
 * In caso di errore mantiene l'ultimo dato valido e lo segnala come non aggiornato.
 */
@Injectable({ providedIn: 'root' })
export class SystemStatusStore {
  private readonly api = inject(TankApi);
  private readonly config = inject(AppConfigService).config;

  private readonly statusState = signal<SystemStatus | null>(null);
  private readonly lastSuccessAt = signal<number | null>(null);
  private readonly errorState = signal<string | null>(null);
  /** Orologio locale a 1 s, serve per l'età del dato. */
  readonly now = signal(Date.now());

  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly loaded = computed(() => this.statusState() !== null);

  readonly dataAgeSec = computed(() => {
    const last = this.lastSuccessAt();
    return last === null ? null : Math.max(0, Math.floor((this.now() - last) / 1000));
  });

  readonly isStale = computed(() => {
    const age = this.dataAgeSec();
    return age === null || age > this.config.staleDataAfterSec;
  });

  /** Confronto fatto sull'ora del server per non dipendere dall'orologio del PC client. */
  readonly plcCommunicationOk = computed(() => {
    const s = this.statusState();
    if (!s || this.isStale()) return false;
    const heartbeatAge = (Date.parse(s.serverTime) - Date.parse(s.plc.heartbeatChangedAt)) / 1000;
    return s.plc.plcReady && heartbeatAge <= this.config.heartbeatTimeoutSec;
  });

  readonly activeHorns = computed<ZoneCode[]>(() =>
    (this.statusState()?.horns ?? []).filter((h) => h.active).map((h) => h.zone),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);

    timer(0, 1000)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    timer(0, this.config.pollingIntervalMs)
      .pipe(
        exhaustMap(() =>
          this.api.getSystemStatus().pipe(
            catchError((err: unknown) => {
              this.errorState.set(err instanceof Error ? err.message : 'Backend non raggiungibile');
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((status) => {
        if (status) {
          this.statusState.set(status);
          this.lastSuccessAt.set(Date.now());
          this.errorState.set(null);
        }
      });
  }

  tank(code: TankCode) {
    return computed(() => this.statusState()?.tanks.find((t) => t.code === code) ?? null);
  }
}
