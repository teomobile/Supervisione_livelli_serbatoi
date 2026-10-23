import { TankCode } from './tank.models';

/**
 * Configurazione di un serbatoio lato supervisore, tutto in litri.
 * Il troppo pieno è il riferimento del 100 %: la percentuale mostrata è livello / troppo pieno.
 * I valori servono a disegnare le linee e a calcolare la %: gli eventi di pieno e troppo pieno
 * li decide il PLC (X_Full con la soglia del programma, X_TooFull dal sensore).
 */
export interface TankConfig {
  code: TankCode;
  /** Nome mostrato in sinottico, dettaglio e trend. */
  name: string;
  /** Livello di troppo pieno = 100 %. */
  tooFullLiters: number;
  /** Soglia di pieno, deve coincidere con quella del programma PLC. */
  fullLiters: number;
  /** Ultima modifica (ISO 8601, UTC); null se mai modificato. */
  updatedAt: string | null;
}

export const CONFIG_LIMITS = {
  nameMaxLength: 30,
  litersMin: 100,
  litersMax: 100_000,
} as const;

/** Errori di validazione di una riga; vuoto = riga valida. */
export function validateTankConfig(c: TankConfig): string[] {
  const errors: string[] = [];
  if (!c.name.trim()) errors.push('Nome obbligatorio');
  if (c.name.length > CONFIG_LIMITS.nameMaxLength) errors.push(`Nome oltre ${CONFIG_LIMITS.nameMaxLength} caratteri`);
  if (!(c.tooFullLiters >= CONFIG_LIMITS.litersMin && c.tooFullLiters <= CONFIG_LIMITS.litersMax)) {
    errors.push(`Troppo pieno tra ${CONFIG_LIMITS.litersMin} e ${CONFIG_LIMITS.litersMax} l`);
  }
  if (!(c.fullLiters > 0)) errors.push('Soglia pieno obbligatoria');
  else if (c.fullLiters >= c.tooFullLiters) errors.push('La soglia pieno deve essere sotto il troppo pieno');
  return errors;
}
