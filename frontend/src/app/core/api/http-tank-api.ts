import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfigService } from '../config/app-config';
import { AlarmEvent, SystemStatus, TankCode, TankHistory } from '../models/tank.models';
import { BackendResponse, unwrapResponse } from './backend-response';
import { AlarmQuery, TankApi } from './tank-api';

@Injectable({ providedIn: 'root' })
export class HttpTankApi extends TankApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  private get baseUrl(): string {
    return `${this.config.config.apiBaseUrl}/Tanks`;
  }

  getSystemStatus(): Observable<SystemStatus> {
    return this.http
      .get<BackendResponse<SystemStatus>>(`${this.baseUrl}/GetSystemStatus`)
      .pipe(unwrapResponse());
  }

  getTankHistory(code: TankCode, from: Date, to: Date): Observable<TankHistory> {
    const params = new HttpParams()
      .set('code', code)
      .set('from', from.toISOString())
      .set('to', to.toISOString());
    return this.http
      .get<BackendResponse<TankHistory>>(`${this.baseUrl}/GetTankHistory`, { params })
      .pipe(unwrapResponse());
  }

  getAlarms(query: AlarmQuery): Observable<AlarmEvent[]> {
    let params = new HttpParams().set('activeOnly', query.activeOnly);
    if (query.from) params = params.set('from', query.from.toISOString());
    if (query.to) params = params.set('to', query.to.toISOString());
    if (query.tankCode) params = params.set('code', query.tankCode);
    return this.http
      .get<BackendResponse<AlarmEvent[]>>(`${this.baseUrl}/GetAlarms`, { params })
      .pipe(unwrapResponse());
  }
}
