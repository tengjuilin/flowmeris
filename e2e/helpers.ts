import { type Page, expect } from '@playwright/test';
import { writeFcs } from '../packages/fcs/src/write.ts';

/**
 * A small FCS file: FSC-A is a ramp 1000…1199 and every event has FL1-A (GFP) = `median`, so a
 * sample's statistics are known exactly.
 */
export function fcs(median: number): Buffer {
  const n = 200;
  const ramp = Float32Array.from({ length: n }, (_, i) => 1000 + i);
  return Buffer.from(
    writeFcs([
      { pnn: 'FSC-A', values: ramp, range: 262144 },
      { pnn: 'FL1-A', pns: 'GFP', values: new Float32Array(n).fill(median), range: 262144 },
    ]),
  );
}

/** Load one file per well (`Specimen_001_<well>.fcs`) with the given FL1-A medians. */
export async function loadWells(page: Page, medians: Record<string, number>) {
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles(
      Object.entries(medians).map(([well, m]) => ({
        name: `Specimen_001_${well}.fcs`,
        mimeType: 'application/octet-stream',
        buffer: fcs(m),
      })),
    );
  await expect(page.getByRole('button', { name: 'All events', exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/** Import sample variables from a CSV keyed by well (in the Metadata tab). */
export async function importDesign(page: Page, csv: string, variables: number) {
  await page.getByRole('tab', { name: 'Metadata' }).click();
  await page.getByTestId('meta-input').setInputFiles({
    name: 'design.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: `Import ${variables} variable(s)` }).click();
}

/** Name and bytes of a downloaded file, from the click that triggers it. */
export async function downloadBytes(page: Page, trigger: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

/** Text of a downloaded file, from the click that triggers it. */
export async function downloadText(page: Page, trigger: () => Promise<void>) {
  const { name, bytes } = await downloadBytes(page, trigger);
  return { name, text: bytes.toString('utf8') };
}

/** Parse a CSV of plain fields (quoted fields with commas allowed). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    rows.push(out);
  }
  return rows;
}

/**
 * The shown text of each body cell of the statistics table column whose full label (its header's
 * title) is `label`, top to bottom. Per-sample tables only (one header cell per column).
 */
export async function statsColumn(page: Page, label: string): Promise<string[]> {
  return page.locator('table.stats').evaluate((t, label) => {
    const heads = [...(t as HTMLTableElement).tHead!.rows[1]!.cells];
    const i = heads.findIndex((h) => h.title === label);
    if (i < 0) throw new Error(`No column ${label}: ${heads.map((h) => h.title).join(', ')}`);
    return [...(t as HTMLTableElement).tBodies[0]!.rows].map((r) => r.cells[i]!.textContent ?? '');
  }, label);
}

/** Full labels of the statistics table's columns (per-sample table). */
export async function statsColumns(page: Page): Promise<string[]> {
  return page
    .locator('table.stats thead tr')
    .nth(1)
    .locator('th')
    .evaluateAll((ths) => ths.map((h) => h.getAttribute('title') ?? ''));
}

/**
 * Wait until the autosaved workspace (IndexedDB, written 1 s after the last change) has `samples`
 * samples in a group, so a reload restores it.
 */
export async function waitForAutosave(page: Page, samples: number) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open('flowmeris');
              req.onerror = () => resolve(-1);
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('workspace')) return resolve(-1);
                const get = db.transaction('workspace').objectStore('workspace').get('current');
                get.onsuccess = () => resolve(get.result?.groups?.[0]?.sampleIds?.length ?? 0);
                get.onerror = () => resolve(-1);
              };
            }),
        ),
      { timeout: 10_000 },
    )
    .toBe(samples);
}

/**
 * The fonts a PDF's text is set in (jsPDF output, uncompressed): for each `Tf` operator, the font's size,
 * BaseFont, and whether the font program is embedded (a font with a descriptor) or a standard PDF font.
 */
export function pdfTextFonts(pdf: Buffer): { size: number; font: string; embedded: boolean }[] {
  const text = pdf.toString('latin1');
  const ref: Record<string, string> = {};
  for (const m of text.matchAll(/\/(F\d+) (\d+) 0 R/g)) ref[m[1]!] = m[2]!;
  const obj = (n: string | undefined) => {
    const i = text.indexOf(`\n${n} 0 obj`);
    return i < 0 ? '' : text.slice(i, text.indexOf('endobj', i));
  };
  const used = new Map<string, { size: number; font: string; embedded: boolean }>();
  for (const [, name, size] of text.matchAll(/\/(F\d+) ([\d.]+) Tf/g)) {
    const o = obj(ref[name!]);
    const font = (o.match(/\/BaseFont \/(\S+)/)?.[1] ?? '?').replace(/#20/g, ' ');
    used.set(`${name} ${size}`, {
      size: Number(size),
      font,
      embedded: /DescendantFonts|FontDescriptor/.test(o),
    });
  }
  return [...used.values()];
}
