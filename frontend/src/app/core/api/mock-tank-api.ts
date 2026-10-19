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
import { TankConfig } from '../models/tank-config';
import { AlarmQuery, TankApi } from './tank-api';

/** Valori iniziali come da specifica: 10.000 l, pieno 85 %, troppo pieno 95 %. */
function defaultConfig(code: TankCode): TankConfig {
  return { code, name: `Serbatoio ${code}`, capacityLiters: 10_000, fullPercent: 85, tooFullPercent: 95, updatedAt: null };
}

function thresholdsOf(c: TankConfig): TankThresholds {
  // Il DB4 non ha soglie di livello basso: restano null.
  return {
    fillLiters: (c.capacityLiters * c.fullPercent) / 100,
    tooFullLiters: (c.capacityLiters * c.tooFullPercent) / 100,
    lowWarningLiters: null,
    lowStopLiters: null,
  };
}
const HOUR_MS = 3_600_000;
const INVALID_WINDOW_MS = 25 * 60_000;

interface Profile {
  base: number;
  amplitude: number;
  periodHours: number;
  phase: number;
}

/** Andamenti simulati in decimi di punto percentuale (10.000 = 100 %): ogni serbatoio ha uno scenario diverso. */
const PROFILES: Record<TankCode, Profile> = {
  A: { base: 6000, amplitude: 2500, periodHours: 20, phase: 0.3 },
  B: { base: 5500, amplitude: 3000, periodHours: 26, phase: 1.7 },
  C: { base: 2900, amplitude: 1200, periodHours: 14, phase: 2.2 },
  D: { base: 7000, amplitude: 1000, periodHours: 30, phase: 0.9 },
  E: { base: 5000, amplitude: 2000, periodHours: 18, phase: 3.1 }, // misura radar non valida negli ultimi minuti
  F: { base: 9150, amplitude: 400, periodHours: 6, phase: 0.0 }, // vicino al massimo
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

function percentAt(code: TankCode, t: number): number {
  const p = PROFILES[code];
  const angle = (t / (p.periodHours * HOUR_MS)) * 2 * Math.PI + p.phase;
  const value = p.base + p.amplitude * Math.sin(angle) + noise(t / 60_000 + code.charCodeAt(0)) * 60;
  return Math.min(100, Math.max(0, value / 100));
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
  /** Configurazione in memoria: si perde ricaricando la pagina, come atteso per i dati simulati. */
  private config = new Map<TankCode, TankConfig>(TANK_CODES.map((c) => [c, defaultConfig(c)]));

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
    const cfg = this.config.get(code)!;
    for (let t = start; t <= end; t += step) {
      const invalid = isInvalidAt(code, t, now);
      const pct = invalid ? null : percentAt(code, t);
      samples.push({
        timestamp: new Date(t).toISOString(),
        levelLiters: pct === null ? null : round1((pct * cfg.capacityLiters) / 100),
        levelPercent: pct === null ? null : round1(pct),
      });
    }
    return of<TankHistory>({ code, capacityLiters: cfg.capacityLiters, thresholds: thresholdsOf(cfg), samples }).pipe(delay(250));
  }

  getAlarms(query: AlarmQuery): Observable<AlarmEvent[]> {
    const now = Date.now();
    const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
    const all: AlarmEvent[] = [
      { id: 11, kind: 'LEVEL_INVALID', tankCode: 'E', message: 'Misura radar serbatoio E non valida', raisedAt: ago(25), clearedAt: null },
      { id: 12, kind: 'FULL', tankCode: 'G', message: 'Serbatoio G: pieno', raisedAt: ago(95), clearedAt: ago(60) },
      { id: 10, kind: 'TOO_FULL', tankCode: 'F', message: 'Serbatoio F livello massimo raggiunto', raisedAt: ago(180), clearedAt: ago(171) },
      { id: 9, kind: 'TOO_FULL', tankCode: 'G', message: 'Serbatoio G livello massimo raggiunto', raisedAt: ago(320), clearedAt: ago(312) },
      { id: 8, kind: 'PLC_COMM', tankCode: null, message: 'Comunicazione PLC interrotta', raisedAt: ago(1500), clearedAt: ago(1493) },
      { id: 3, kind: 'PLC_NOT_READY', tankCode: null, message: 'PLC non pronto', raisedAt: ago(1510), clearedAt: ago(1490) },
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

  getTankConfig(): Observable<TankConfig[]> {
    return of(TANK_CODES.map((c) => ({ ...this.config.get(c)! }))).pipe(delay(150));
  }

  saveTankConfig(changes: TankConfig[]): Observable<TankConfig[]> {
    const updatedAt = new Date().toISOString();
    for (const c of changes) {
      this.config.set(c.code, { ...c, name: c.name.trim(), updatedAt });
    }
    return this.getTankConfig().pipe(delay(250));
  }

  private tankAt(code: TankCode, now: number): TankStatus {
    const cfg = this.config.get(code)!;
    const invalid = isInvalidAt(code, now, now);
    const pct = invalid ? null : percentAt(code, now);
    return {
      code,
      name: cfg.name,
      zone: ZONE_OF[code],
      capacityLiters: cfg.capacityLiters,
      levelPercent: pct === null ? null : round1(pct),
      levelLiters: pct === null ? null : round1((pct * cfg.capacityLiters) / 100),
      levelValid: !invalid,
      // Simulazione dei bit PLC: in realtà X_Full usa la soglia del programma, X_TooFull il sensore.
      full: pct !== null && pct >= cfg.fullPercent,
      tooFull: pct !== null && pct >= cfg.tooFullPercent,
      tooFullFault: false,
      thresholds: thresholdsOf(cfg),
      timestamp: new Date(now - 2000).toISOString(),
    };
  }
}
