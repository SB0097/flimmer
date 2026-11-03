/** CSV einschließlich BOM, CRLF, Kommas/Zeilenumbrüchen in Anführungszeichen und doppelten Quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  const value = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '"') {
      if (quoted && value[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || !field) quoted = !quoted;
      else throw new Error('Die CSV-Datei enthält ungültige Anführungszeichen.');
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (c === '\r' && value[i + 1] === '\n') i++;
    } else field += c;
  }
  if (quoted) throw new Error('Die CSV-Datei ist unvollständig.');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export const columnKey = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
