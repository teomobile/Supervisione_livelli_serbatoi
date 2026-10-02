import { TankCode } from './tank.models';

/**
 * Configurazione di un serbatoio lato supervisore.
 * Le percentuali servono solo a disegnare le linee: gli eventi di pieno e troppo pieno
 * li decide il PLC (X_Full con la soglia del programma, X_TooFull dal sensore).
 */
export interface TankConfig {
  code: TankCode;
  /** Nome mostrato in sinottico, dettaglio e trend. */
  name: string;
  capacityLiters: number;
  /** Soglia di pieno, deve coincidere con quella del programma PLC. */
  fullPercent: number;
  /** Quota del sensore di troppo pieno. */
  tooFullPercent: number;
  /** Ultima modifica (ISO 8601, UTC); null se mai modificato. */
  updatedAt: string | null;
}

export const CONFIG_LIMITS = {
  nameMaxLength: 30,
  capacityMin: 100,
  capacityMax: 100_000,
} as const;

/** Errori di validazione di una riga; vuoto = riga valida. */
export function validateTankConfig(c: TankConfig): string[] {
  const errors: string[] = [];
  if (!c.name.trim()) errors.push('Nome obbligatorio');
  if (c.name.length > CONFIG_LIMITS.nameMaxLength) errors.push(`Nome oltre ${CONFIG_LIMITS.nameMaxLength} caratteri`);
  if (!(c.capacityLiters >= CONFIG_LIMITS.capacityMin && c.capacityLiters <= CONFIG_LIMITS.capacityMax)) {
    errors.push(`Capacità tra ${CONFIG_LIMITS.capacityMin} e ${CONFIG_LIMITS.capacityMax} l`);
  }
  if (!(c.fullPercent > 0 && c.fullPercent < 100)) errors.push('Soglia pieno tra 0 e 100 %');
  if (!(c.tooFullPercent > 0 && c.tooFullPercent <= 100)) errors.push('Troppo pieno tra 0 e 100 %');
  if (c.fullPercent >= c.tooFullPercent) errors.push('La soglia pieno deve essere sotto il troppo pieno');
  return errors;
}
