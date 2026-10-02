import { TankStatus } from './tank.models';

/** Stato sintetico del serbatoio, usato per scegliere il colore (normale = neutro). */
export type TankCondition = 'normal' | 'warning' | 'alarm' | 'invalid';

export function tankCondition(t: TankStatus): TankCondition {
  if (!t.levelValid || t.levelLiters === null) return 'invalid';
  if (t.tooFull || t.levelLiters <= t.thresholds.lowStopLiters) return 'alarm';
  if (t.tooFullFault || t.levelLiters <= t.thresholds.lowWarningLiters) return 'warning';
  return 'normal';
}
