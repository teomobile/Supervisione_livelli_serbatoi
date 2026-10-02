export const TANK_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type TankCode = (typeof TANK_CODES)[number];

/** Zone servite dalle sirene Horn_AB, Horn_CD, Horn_EF, Horn_GH del DB_Gestionale. */
export type ZoneCode = 'AB' | 'CD' | 'EF' | 'GH';

/**
 * Soglie in litri. Il DB4 espone solo i bit (X_Full, X_TooFull), non i valori:
 * il backend li legge dalla propria configurazione.
 * null = soglia non disponibile, non viene disegnata né usata per gli allarmi.
 */
export interface TankThresholds {
  /** Soglia di pieno usata dal PLC per X_Full. */
  fillLiters: number | null;
  /** Quota di installazione del sensore di troppo pieno (X_TooFull). */
  tooFullLiters: number | null;
  /** Livello basso: preavviso (non ancora presente nel DB4). */
  lowWarningLiters: number | null;
  /** Livello minimo: stop prelievo (non ancora presente nel DB4). */
  lowStopLiters: number | null;
}

export interface TankStatus {
  code: TankCode;
  name: string;
  zone: ZoneCode;
  capacityLiters: number;
  /** null quando la misura non è disponibile. */
  levelPercent: number | null;
  levelLiters: number | null;
  /** X_LevelValid */
  levelValid: boolean;
  /** X_Full: pieno secondo soglia radar. */
  full: boolean;
  /** X_TooFull: sensore di massimo livello intervenuto. */
  tooFull: boolean;
  /** X_TooFullFault: anomalia sensore di massimo livello. */
  tooFullFault: boolean;
  thresholds: TankThresholds;
  /** Timestamp del dato storicizzato (ISO 8601, UTC). */
  timestamp: string;
}

export interface PlcStatus {
  plcReady: boolean;
  heartbeat: number;
  /** Ultima variazione dell'heartbeat registrata dallo storico (ISO 8601, UTC). */
  heartbeatChangedAt: string;
  dataVersion: number;
}

export interface ZoneHorn {
  zone: ZoneCode;
  active: boolean;
}

/** Fotografia completa usata dal sinottico, ottenuta con una sola chiamata. */
export interface SystemStatus {
  plc: PlcStatus;
  tanks: TankStatus[];
  horns: ZoneHorn[];
  /** Ora del server al momento della risposta (ISO 8601, UTC). */
  serverTime: string;
}

export interface LevelSample {
  timestamp: string;
  levelLiters: number | null;
  levelPercent: number | null;
}

export interface TankHistory {
  code: TankCode;
  capacityLiters: number;
  thresholds: TankThresholds;
  samples: LevelSample[];
}

export type AlarmKind = 'TOO_FULL' | 'TOO_FULL_FAULT' | 'LEVEL_INVALID' | 'LOW_WARNING' | 'LOW_STOP' | 'PLC_COMM';

export interface AlarmEvent {
  id: number;
  kind: AlarmKind;
  /** null per gli eventi non legati a un serbatoio (es. comunicazione PLC). */
  tankCode: TankCode | null;
  message: string;
  raisedAt: string;
  clearedAt: string | null;
}

export const ZONE_LABELS: Record<ZoneCode, string> = {
  AB: 'Zona A-B',
  CD: 'Zona C-D',
  EF: 'Zona E-F',
  GH: 'Zona G-H',
};

export const ALARM_LABELS: Record<AlarmKind, string> = {
  TOO_FULL: 'Troppo pieno',
  TOO_FULL_FAULT: 'Guasto sensore max',
  LEVEL_INVALID: 'Misura non valida',
  LOW_WARNING: 'Livello basso',
  LOW_STOP: 'Livello minimo',
  PLC_COMM: 'Comunicazione PLC',
};

/** Gravità: allarme = richiede intervento, avviso = anomalia da verificare. */
export type AlarmSeverity = 'alarm' | 'warning';

export const ALARM_SEVERITY: Record<AlarmKind, AlarmSeverity> = {
  TOO_FULL: 'alarm',
  LOW_STOP: 'alarm',
  PLC_COMM: 'alarm',
  TOO_FULL_FAULT: 'warning',
  LEVEL_INVALID: 'warning',
  LOW_WARNING: 'warning',
};

export const SEVERITY_LABELS: Record<AlarmSeverity, string> = {
  alarm: 'Allarme',
  warning: 'Avviso',
};
