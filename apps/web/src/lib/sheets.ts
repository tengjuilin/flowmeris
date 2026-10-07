import { type Grid, parseDelimited } from '@flowmeris/table';

export interface Sheet {
  name: string;
  grid: Grid;
}

export const TABLE_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods';

/**
 * Read a CSV/TSV text file or a spreadsheet (every sheet) as grids of
 * strings, in the browser. Spreadsheets are read with SheetJS, loaded on
 * first use; numeric cells take their stored value (not the displayed,
 * possibly rounded or thousands-separated text).
 */
export async function readTableFile(file: File): Promise<Sheet[]> {
  if (/\.(csv|tsv|txt)$/i.test(file.name))
    return [{ name: file.name, grid: parseDelimited(await file.text()) }];
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.map((name) => ({
    name,
    grid: XLSX.utils
      .sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: '', blankrows: true })
      .map((row) => row.map((v) => (v === null || v === undefined ? '' : String(v)))),
  }));
}
