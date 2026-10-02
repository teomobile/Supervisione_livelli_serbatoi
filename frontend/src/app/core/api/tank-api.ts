import { Observable } from 'rxjs';
import { AlarmEvent, SystemStatus, TankCode, TankHistory } from '../models/tank.models';

export interface AlarmQuery {
  activeOnly: boolean;
  from?: Date;
  to?: Date;
  tankCode?: TankCode;
}

/**
 * Contratto verso il backend. Implementato da HttpTankApi (backend reale)
 * e da MockTankApi (sviluppo senza System Platform).
 */
export abstract class TankApi {
  abstract getSystemStatus(): Observable<SystemStatus>;
  abstract getTankHistory(code: TankCode, from: Date, to: Date): Observable<TankHistory>;
  abstract getAlarms(query: AlarmQuery): Observable<AlarmEvent[]>;
}
