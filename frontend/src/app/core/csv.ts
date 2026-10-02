/** Genera e scarica un CSV compatibile con Excel in italiano (separatore ;, virgola decimale). */
export function downloadCsv(fileName: string, header: string[], rows: (string | number | null)[][]): void {
  const cell = (v: string | number | null) => {
    if (v === null) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [header, ...rows].map((r) => r.map(cell).join(';'));
  // BOM UTF-8 per far riconoscere gli accenti a Excel.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
