export class OutputFormatter {
  static formatJson(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  static formatTable(
    headers: string[],
    rows: string[][],
    columnWidths?: number[],
  ): string {
    const widths =
      columnWidths ??
      headers.map((h, i) =>
        Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
      );

    const pad = (s: string, w: number) => s.padEnd(w);
    const line = widths.map((w) => '-'.repeat(w)).join('-+-');

    const headerRow = headers.map((h, i) => pad(h, widths[i])).join(' | ');
    const dataRows = rows.map((r) =>
      r.map((c, i) => pad(c ?? '', widths[i])).join(' | '),
    );

    return [headerRow, line, ...dataRows].join('\n');
  }

  static formatKeyValue(pairs: [string, string][]): string {
    const maxKey = Math.max(...pairs.map(([k]) => k.length));
    return pairs.map(([k, v]) => `${k.padEnd(maxKey)}  ${v}`).join('\n');
  }
}
