/** "1 allarme", "3 allarmi". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Durata leggibile: "45 min", "2 h 05 min", "3 g 4 h". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const totalH = Math.floor(totalMin / 60);
  if (totalH < 24) return `${totalH} h ${String(totalMin % 60).padStart(2, '0')} min`;
  return `${Math.floor(totalH / 24)} g ${totalH % 24} h`;
}
