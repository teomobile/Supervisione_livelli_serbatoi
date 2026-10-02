export type PeriodKey = '8h' | '24h' | '7d' | '30d' | 'custom';

export const PERIOD_OPTIONS: { label: string; value: PeriodKey }[] = [
  { label: '8 ore', value: '8h' },
  { label: '24 ore', value: '24h' },
  { label: '7 giorni', value: '7d' },
  { label: '30 giorni', value: '30d' },
  { label: 'Intervallo', value: 'custom' },
];

const HOURS: Record<Exclude<PeriodKey, 'custom'>, number> = { '8h': 8, '24h': 24, '7d': 168, '30d': 720 };

export interface TimeRange {
  from: Date;
  to: Date;
}

/** Restituisce null se l'intervallo personalizzato non è completo. */
export function resolveRange(period: PeriodKey, custom: Date[] | null): TimeRange | null {
  if (period === 'custom') {
    if (!custom || custom.length < 2 || !custom[0] || !custom[1]) return null;
    return { from: custom[0], to: custom[1] };
  }
  const to = new Date();
  return { from: new Date(to.getTime() - HOURS[period] * 3_600_000), to };
}
