import { TankStatus } from './tank.models';

/** Stato sintetico del serbatoio, usato per scegliere il colore (normale = neutro). */
export type TankCondition = 'normal' | 'warning' | 'alarm' | 'invalid';

function atOrBelow(level: number, threshold: number | null): boolean {
  return threshold !== null && level <= threshold;
}

export function tankCondition(t: TankStatus): TankCondition {
  if (!t.levelValid || t.levelLiters === null) return 'invalid';
  if (t.tooFull || atOrBelow(t.levelLiters, t.thresholds.lowStopLiters)) return 'alarm';
  if (t.tooFullFault || atOrBelow(t.levelLiters, t.thresholds.lowWarningLiters)) return 'warning';
  return 'normal';
}

export interface TankNote {
  label: string;
  css: 'alarm' | 'warning' | 'full' | 'info';
  /** Lampeggio per distinguere il troppo pieno (sensore di sicurezza) dal pieno. */
  blink: boolean;
}

/** Etichetta principale mostrata accanto al nome, in ordine di gravità. */
export function tankNote(t: TankStatus): TankNote | null {
  if (t.tooFull) return { label: 'Troppo pieno', css: 'alarm', blink: true };
  if (t.levelLiters !== null && t.levelValid) {
    if (atOrBelow(t.levelLiters, t.thresholds.lowStopLiters)) return { label: 'Liv. minimo', css: 'alarm', blink: false };
    if (atOrBelow(t.levelLiters, t.thresholds.lowWarningLiters)) return { label: 'Liv. basso', css: 'warning', blink: false };
  }
  if (t.full) return { label: 'Pieno', css: 'full', blink: false };
  return null;
}
