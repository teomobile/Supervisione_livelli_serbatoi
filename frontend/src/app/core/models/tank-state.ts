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
  css: 'alarm' | 'warning' | 'info';
}

/** Etichetta principale mostrata accanto al nome, in ordine di gravità. */
export function tankNote(t: TankStatus): TankNote | null {
  if (t.tooFull) return { label: 'Troppo pieno', css: 'alarm' };
  if (t.levelLiters !== null && t.levelValid) {
    if (atOrBelow(t.levelLiters, t.thresholds.lowStopLiters)) return { label: 'Liv. minimo', css: 'alarm' };
    if (atOrBelow(t.levelLiters, t.thresholds.lowWarningLiters)) return { label: 'Liv. basso', css: 'warning' };
  }
  if (t.full) return { label: 'Pieno', css: 'info' };
  return null;
}
