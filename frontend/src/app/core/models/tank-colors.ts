import { TankCode } from './tank.models';

/**
 * Colore fisso per serbatoio nei grafici comparati: il colore segue il serbatoio,
 * non la posizione nella selezione. Palette categorica validata per daltonismo
 * (coppie adiacenti) sullo sfondo dei pannelli.
 */
export const TANK_COLORS: Record<TankCode, string> = {
  A: '#2a78d6',
  B: '#eb6834',
  C: '#1baf7a',
  D: '#eda100',
  E: '#e87ba4',
  F: '#008300',
  G: '#4a3aa7',
  H: '#e34948',
};
