import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { downloadBytes, importDesign, loadWells, pdfTextFonts } from './helpers.ts';

/**
 * Figure export (ADR-0011, ADR-0012, ADR-0013): a figure's text is exported at its on-screen size. A PDF
 * names Arial, Helvetica, Times New Roman and Courier New without embedding them; it embeds other system
 * fonts where the browser can read them, else their bundled stand-ins, with a warning. SVG files name
 * their fonts without carrying them.
 */

const FONTS = new URL('../apps/web/src/assets/fonts/', import.meta.url).pathname;

/**
 * Control the fonts the page can read from the computer (Local Font Access): none, as in Firefox and
 * Safari or when the user declines, or `fonts` (family, style, file in the bundled fonts).
 */
async function installedFonts(page: Page, fonts: [string, string, string][] = []) {
  const files = fonts.map(([family, style, file]) => ({
    family,
    style,
    b64: readFileSync(FONTS + file).toString('base64'),
  }));
  await page.addInitScript((list) => {
    const w = window as unknown as Record<string, unknown>;
    w.fontQueries = 0;
    if (!list.length) {
      w.queryLocalFonts = undefined;
      return;
    }
    w.queryLocalFonts = async () => {
      w.fontQueries = (w.fontQueries as number) + 1;
      return list.map((f) => ({
        family: f.family,
        style: f.style,
        postscriptName: `${f.family}-${f.style}`,
        blob: async () => new Blob([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))]),
      }));
    };
  }, files);
}

/** Export the figure of the visible Export menu as `format`. */
async function exportAs(page: Page, format: string) {
  return downloadBytes(page, async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('combobox', { name: 'Format' }).selectOption(format);
    await page.getByRole('button', { name: 'Download' }).click();
  });
}

/** Font family (first name) and px sizes of the figure's text on screen. */
async function screenText(page: Page, svg: string) {
  return page.locator(svg).evaluate(async (el) => {
    await document.fonts.ready;
    // Texts and tspans (raised tick exponents) with characters of their own.
    const texts = [...el.querySelectorAll('text, tspan')].filter((t) =>
      [...t.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()),
    );
    const cs = texts.map((t) => getComputedStyle(t));
    return {
      families: [...new Set(cs.map((c) => c.fontFamily.split(',')[0]!.replace(/"/g, '')))],
      sizes: [...new Set(cs.map((c) => Number.parseFloat(c.fontSize)))].toSorted((a, b) => a - b),
      kerning: [...new Set(cs.map((c) => c.fontKerning))],
    };
  });
}

test('a plot in Arial names Arial in its PDF and SVG without embedding it', async ({ page }) => {
  // Fonts the browser could read: none needed, so none asked for (Chromium would prompt).
  await installedFonts(page, [['Arial', 'Regular', 'LiberationSans-Regular.ttf']]);
  await loadWells(page, { A01: 100, A02: 200 });
  const plot = '.plot-panel svg.plot-overlay';
  await expect(page.locator(`${plot} text`).first()).toBeVisible();
  const screen = await screenText(page, plot);
  expect(screen.families).toEqual(['Arial']);
  expect(screen.kerning).toEqual(['none']);

  const pdf = await exportAs(page, 'pdf');
  expect(pdf.name).toMatch(/\.pdf$/);
  const fonts = pdfTextFonts(pdf.bytes);
  expect(fonts.length).toBeGreaterThan(0);
  for (const f of fonts)
    expect(f).toMatchObject({ font: expect.stringMatching(/^Arial-?\w*MT$/), embedded: false });
  // The PDF's units are the figure's px, so each text keeps its on-screen size.
  expect([...new Set(fonts.map((f) => f.size))].toSorted((a, b) => a - b)).toEqual(screen.sizes);
  expect(pdf.bytes.toString('latin1')).not.toContain('/FontFile');
  // Deflated, with the event raster at 300 dpi: about 8 MB before, mostly the raster stored raw.
  expect(pdf.bytes.length).toBeLessThan(500_000);
  expect(await page.evaluate(() => (window as unknown as { fontQueries: number }).fontQueries)).toBe(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  const svg = (await exportAs(page, 'svg')).bytes.toString('utf8');
  expect(svg).not.toContain('@font-face');
  // Each text's families, unquoted: browsers quote them differently.
  const unquoted = svg.replaceAll('&quot;', '').replaceAll("'", '');
  const stacks = [...unquoted.matchAll(/<(?:text|tspan)[^>]*?font-family:\s*([^;"]*)/g)].map((m) =>
    m[1]!
      .split(',')
      .map((f) => f.trim())
      .join(', '),
  );
  expect(stacks.length).toBeGreaterThan(0);
  expect(new Set(stacks)).toEqual(new Set(['Arial, Liberation Sans, sans-serif']));
  expect(svg).toContain('<metadata>');
  // About 0.5 MB per face before, base64 font files.
  expect(svg.length).toBeLessThan(200_000);
});

/** A new chart of a statistic, open in the Charts view, with its settings panel's Text tab. */
async function chartText(page: Page) {
  await loadWells(page, { A01: 100, A02: 200, B01: 110, B02: 220 });
  await importDesign(page, 'Well,Dose,Replicate\nA1,1,r1\nA2,10,r1\nB1,1,r2\nB2,10,r2\n', 2);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await page.locator('.add-stat label', { hasText: 'Channel' }).locator('select').selectOption('FL1-A');
  await page.getByRole('button', { name: 'Add statistic' }).click();
  await page.getByRole('tab', { name: 'Charts' }).click();
  await page.getByRole('button', { name: '+ New chart' }).click();
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(4);
  const panel = page.getByRole('complementary', { name: 'Chart settings' });
  await panel.getByRole('tab', { name: 'Text' }).click();
  return panel;
}

test('a chart in a font without a standard PDF font embeds its stand-in, with a warning', async ({
  page,
}) => {
  await installedFonts(page);
  const panel = await chartText(page);
  await panel.getByRole('combobox', { name: 'Base font', exact: true }).selectOption({ label: 'Verdana' });
  const pdf = (await exportAs(page, 'pdf')).bytes;
  const fonts = pdfTextFonts(pdf);
  expect(fonts.length).toBeGreaterThan(0);
  for (const f of fonts) expect(f).toMatchObject({ font: 'DejaVu Sans', embedded: true });
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText(/The PDF uses DejaVu Sans in place of Verdana\./);
  await expect(alert).toHaveClass('toast warning');
  await expect(alert.locator('svg.warning-icon')).toBeVisible();
  await alert.getByRole('button', { name: 'Dismiss' }).click();
  await expect(alert).toHaveCount(0);
});

test('a chart in an installed font without a standard PDF font embeds that font, without a warning', async ({
  page,
}) => {
  // Stands in for the computer's Verdana, as Chromium reads it once the user allows it.
  await installedFonts(page, [
    ['Verdana', 'Regular', 'DejaVuSans.ttf'],
    ['Verdana', 'Bold', 'DejaVuSans-Bold.ttf'],
  ]);
  const panel = await chartText(page);
  await panel.getByRole('combobox', { name: 'Base font', exact: true }).selectOption({ label: 'Verdana' });
  const fonts = pdfTextFonts((await exportAs(page, 'pdf')).bytes);
  expect(fonts.length).toBeGreaterThan(0);
  for (const f of fonts) expect(f).toMatchObject({ font: 'Verdana', embedded: true });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a chart in Times New Roman names each face it uses, bold and italic included', async ({ page }) => {
  await installedFonts(page);
  const panel = await chartText(page);
  const base = panel.getByRole('combobox', { name: 'Base font', exact: true });
  await expect(base.locator('option:checked')).toHaveText('Arial');
  await base.selectOption({ label: 'Times New Roman' });
  // Bold tick labels and italic legend text need faces of their own.
  await panel.getByRole('button', { name: 'Bold tick labels' }).click();
  await panel.getByRole('button', { name: 'Italic legend' }).click();
  const screen = await screenText(page, 'svg.stat-chart');
  expect(screen.families).toEqual(['Times New Roman']);

  const pdf = (await exportAs(page, 'pdf')).bytes;
  const fonts = pdfTextFonts(pdf);
  expect(new Set(fonts.map((f) => f.font))).toEqual(
    new Set(['TimesNewRomanPS-BoldMT', 'TimesNewRomanPS-ItalicMT']),
  );
  for (const f of fonts) expect(f.embedded).toBe(false);
  expect(pdf.toString('latin1')).not.toContain('/FontFile');
  expect([...new Set(fonts.map((f) => f.size))].toSorted((a, b) => a - b)).toEqual(screen.sizes);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
