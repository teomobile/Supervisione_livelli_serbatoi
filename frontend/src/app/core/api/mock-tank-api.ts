import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import {
  AlarmEvent,
  LevelSample,
  SystemStatus,
  TANK_CODES,
  TankCode,
  TankHistory,
  TankStatus,
  TankThresholds,
  ZoneCode,
} from '../models/tank.models';
import { AlarmQuery, TankApi } from './tank-api';

const CAPACITY_LITERS = 10_000;
/** Valori di esempio: quelli reali li fornirà il backend dalla sua configurazione. */
const PLC_FULL_LITERS = 8500;
const PLC_TOO_FULL_LITERS = 9350;
// Il DB4 non ha soglie di livello basso: restano null.
const THRESHOLDS: TankThresholds = {
  fillLiters: PLC_FULL_LITERS,
  tooFullLiters: PLC_TOO_FULL_LITERS,
  lowWarningLiters: null,
  lowStopLiters: null,
};
const HOUR_MS = 3_600_000;
const INVALID_WINDOW_MS = 25 * 60_000;

interface Profile {
  base: number;
  amplitude: number;
  periodHours: number;
  phase: number;
}

/** Andamenti simulati: ogni serbatoio ha uno scenario diverso per vedere tutti gli stati. */
const PROFILES: Record<TankCode, Profile> = {
  A: { base: 6000, amplitude: 2500, periodHours: 20, phase: 0.3 },
  B: { base: 5500, amplitude: 3000, periodHours: 26, phase: 1.7 },
  C: { base: 2900, amplitude: 1200, periodHours: 14, phase: 2.2 },
  D: { base: 7000, amplitude: 1000, periodHours: 30, phase: 0.9 },
  E: { base: 5000, amplitude: 2000, periodHours: 18, phase: 3.1 }, // misura radar non valida negli ultimi minuti
  F: { base: 9050, amplitude: 400, periodHours: 6, phase: 0.0 }, // vicino al massimo
  G: { base: 7500, amplitude: 1500, periodHours: 48, phase: 1.1 },
  H: { base: 800, amplitude: 300, periodHours: 10, phase: 2.6 }, // sotto il minimo
};

const ZONE_OF: Record<TankCode, ZoneCode> = {
  A: 'AB', B: 'AB', C: 'CD', D: 'CD', E: 'EF', F: 'EF', G: 'GH', H: 'GH',
};

function noise(seed: number): number {
  const x = Math.sin(seed) * 10_000;
  return x - Math.floor(x) - 0.5;
}

function litersAt(code: TankCode, t: number): number {
  const p = PROFILES[code];
  const angle = (t / (p.periodHours * HOUR_MS)) * 2 * Math.PI + p.phase;
  const value = p.base + p.amplitude * Math.sin(angle) + noise(t / 60_000 + code.charCodeAt(0)) * 60;
  return Math.min(CAPACITY_LITERS, Math.max(0, value));
}

function isInvalidAt(code: TankCode, t: number, now: number): boolean {
  return code === 'E' && now - t < INVALID_WINDOW_MS;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

@Injectable({ providedIn: 'root' })
export class MockTankApi extends TankApi {
  private readonly startedAt = Date.now();

  getSystemStatus(): Observable<SystemStatus> {
    const now = Date.now();
    const tanks = TANK_CODES.map((code) => this.tankAt(code, now));
    const horns = (['AB', 'CD', 'EF', 'GH'] as ZoneCode[]).map((zone) => ({
      zone,
      active: tanks.some((t) => t.zone === zone && t.tooFull),
    }));
    return of<SystemStatus>({
      plc: {
        plcReady: true,
        heartbeat: Math.floor((now - this.startedAt) / 1000),
        heartbeatChangedAt: new Date(now - 1000).toISOString(),
        dataVersion: 1,
      },
      tanks,
      horns,
      serverTime: new Date(now).toISOString(),
    }).pipe(delay(150));
  }

  getTankHistory(code: TankCode, from: Date, to: Date): Observable<TankHistory> {
    const now = Date.now();
    const start = from.getTime();
    const end = Math.min(to.getTime(), now);
    // Circa 600 punti per intervallo, come farebbe una query ciclica sullo storico.
    const step = Math.max(60_000, Math.floor((end - start) / 600));
    const samples: LevelSample[] = [];
    for (let t = start; t <= end; t += step) {
      const invalid = isInvalidAt(code, t, now);
      const liters = invalid ? null : round1(litersAt(code, t));
      samples.push({
        timestamp: new Date(t).toISOString(),
        levelLiters: liters,
        levelPercent: liters === null ? null : round1((liters / CAPACITY_LITERS) * 100),
      });
    }
    return of<TankHistory>({ code, capacityLiters: CAPACITY_LITERS, thresholds: THRESHOLDS, samples }).pipe(delay(250));
  }

  getAlarms(query: AlarmQuery): Observable<AlarmEvent[]> {
    const now = Date.now();
    const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
    const all: AlarmEvent[] = [
      { id: 11, kind: 'LEVEL_INVALID', tankCode: 'E', message: 'Misura radar serbatoio E non valida', raisedAt: ago(25), clearedAt: null },
      { id: 10, kind: 'TOO_FULL', tankCode: 'F', message: 'Serbatoio F livello massimo raggiunto', raisedAt: ago(180), clearedAt: ago(171) },
      { id: 9, kind: 'TOO_FULL', tankCode: 'G', message: 'Serbatoio G livello massimo raggiunto', raisedAt: ago(320), clearedAt: ago(312) },
      { id: 8, kind: 'PLC_COMM', tankCode: null, message: 'Comunicazione PLC interrotta', raisedAt: ago(1500), clearedAt: ago(1493) },
      { id: 7, kind: 'TOO_FULL_FAULT', tankCode: 'D', message: 'Anomalia sensore massimo livello serbatoio D', raisedAt: ago(2900), clearedAt: ago(2650) },
      { id: 6, kind: 'LEVEL_INVALID', tankCode: 'H', message: 'Misura radar serbatoio H non valida', raisedAt: ago(3100), clearedAt: ago(3085) },
      { id: 5, kind: 'TOO_FULL', tankCode: 'B', message: 'Serbatoio B livello massimo raggiunto', raisedAt: ago(4400), clearedAt: ago(4392) },
      { id: 4, kind: 'TOO_FULL', tankCode: 'A', message: 'Serbatoio A livello massimo raggiunto', raisedAt: ago(6200), clearedAt: ago(6191) },
    ];
    const status = TANK_CODES.map((code) => this.tankAt(code, now));
    if (status.find((t) => t.code === 'F')?.tooFull) {
      all.unshift({ id: 13, kind: 'TOO_FULL', tankCode: 'F', message: 'Serbatoio F livello massimo raggiunto', raisedAt: ago(2), clearedAt: null });
    }
    const result = all.filter((a) => {
      if (query.activeOnly && a.clearedAt !== null) return false;
      if (query.tankCode && a.tankCode !== query.tankCode) return false;
      const raised = new Date(a.raisedAt).getTime();
      if (query.from && raised < query.from.getTime()) return false;
      if (query.to && raised > query.to.getTime()) return false;
      return true;
    });
    return of(result).pipe(delay(150));
  }

  private tankAt(code: TankCode, now: number): TankStatus {
    const invalid = isInvalidAt(code, now, now);
    const liters = invalid ? null : round1(litersAt(code, now));
    return {
      code,
      name: `Serbatoio ${code}`,
      zone: ZONE_OF[code],
      capacityLiters: CAPACITY_LITERS,
      levelPercent: liters === null ? null : round1((liters / CAPACITY_LITERS) * 100),
      levelLiters: liters,
      levelValid: !invalid,
      full: liters !== null && liters >= PLC_FULL_LITERS,
      tooFull: liters !== null && liters >= PLC_TOO_FULL_LITERS,
      tooFullFault: false,
      thresholds: THRESHOLDS,
      timestamp: new Date(now - 2000).toISOString(),
    };
  }
}
