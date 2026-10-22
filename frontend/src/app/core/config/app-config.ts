import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Configurazione letta a runtime da /config.json.
 * Permette di cambiare i parametri o passare ai dati mock modificando il file su IIS, senza ricompilare.
 */
export interface AppConfig {
  /**
   * URL delle API. Predefinito: baseUrl dell'environment (environment.ts in sviluppo,
   * environment.prod.ts in produzione) + "/api"; se presente in config.json ha la precedenza.
   */
  apiBaseUrl: string;
  useMock: boolean;
  /** Intervallo di aggiornamento del sinottico. */
  pollingIntervalMs: number;
  /** Oltre questa età l'ultimo dato ricevuto viene segnalato come non aggiornato. */
  staleDataAfterSec: number;
  /**
   * Se l'heartbeat PLC non cambia entro questo tempo la comunicazione è considerata persa.
   * Deve coincidere con TankPlc:HeartbeatTimeoutSec del backend (che legge il PLC ogni secondo).
   */
  heartbeatTimeoutSec: number;
}

const DEFAULTS: AppConfig = {
  apiBaseUrl: `${environment.baseUrl}/api`,
  useMock: false,
  pollingIntervalMs: 5000,
  staleDataAfterSec: 30,
  heartbeatTimeoutSec: 20,
};

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly http = inject(HttpClient);
  private current: AppConfig = DEFAULTS;

  get config(): AppConfig {
    return this.current;
  }

  async load(): Promise<void> {
    try {
      const loaded = await firstValueFrom(this.http.get<Partial<AppConfig>>('config.json'));
      this.current = { ...DEFAULTS, ...loaded };
    } catch {
      console.warn('config.json non trovato, uso i valori predefiniti');
    }
  }
}
