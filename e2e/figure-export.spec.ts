import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { downloadBytes, importDesign, loadWells, pdfTextFonts } from './helpers.ts';

/**
 * Figure export (ADR-0011, ADR-0012): a figure's text is exported at its on-screen size in its system
 * font where the browser can embed it, else in that font's bundled stand-in, with a warning; the font is
 * always embedded.
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
    if (!list.length) {
      w.queryLocalFonts = undefined;
      return;
    }
    w.queryLocalFonts = async () =>
      list.map((f) => ({
        family: f.family,
        style: f.style,
        postscriptName: `${f.family}-${f.style}`,
        blob: async () => new Blob([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))]),
      }));
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
    const texts = [...el.querySelectorAll('text')].filter((t) => t.textContent?.trim());
    const cs = texts.map((t) => getComputedStyle(t));
    return {
      families: [...new Set(cs.map((c) => c.fontFamily.split(',')[0]!.replace(/"/g, '')))],
      sizes: [...new Set(cs.map((c) => Number.parseFloat(c.fontSize)))].toSorted((a, b) => a - b),
      kerning: [...new Set(cs.map((c) => c.fontKerning))],
    };
  });
}

test('a plot whose system font cannot be embedded exports in its stand-in, with a warning', async ({
  page,
}) => {
  await installedFonts(page);
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
  for (const f of fonts) expect(f).toMatchObject({ font: 'Liberation Sans', embedded: true });
  // The PDF's units are the figure's px, so each text keeps its on-screen size.
  expect([...new Set(fonts.map((f) => f.size))].toSorted((a, b) => a - b)).toEqual(screen.sizes);
  expect(pdf.bytes.toString('latin1')).toContain('/FontFile2');
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText(/The PDF uses Liberation Sans in place of Arial\./);
  await expect(alert).toHaveClass('toast warning');
  await expect(alert.locator('svg.warning-icon')).toBeVisible();
  await alert.getByRole('button', { name: 'Dismiss' }).click();
  await expect(alert).toHaveCount(0);

  const svg = (await exportAs(page, 'svg')).bytes.toString('utf8');
  expect(svg).toMatch(
    /@font-face\{font-family:"Liberation Sans";font-weight:400;font-style:normal;src:url\(data:font\/ttf;base64,/,
  );
  expect(svg).toContain('<metadata>');
});

test('a plot in an installed font embeds that font, without a warning', async ({ page }) => {
  // Stands in for the computer's Arial, as Chromium reads it once the user allows it.
  await installedFonts(page, [
    ['Arial', 'Regular', 'LiberationSans-Regular.ttf'],
    ['Arial', 'Bold', 'LiberationSans-Bold.ttf'],
  ]);
  await loadWells(page, { A01: 100, A02: 200 });
  await expect(page.locator('.plot-panel svg.plot-overlay text').first()).toBeVisible();
  const fonts = pdfTextFonts((await exportAs(page, 'pdf')).bytes);
  expect(fonts.length).toBeGreaterThan(0);
  for (const f of fonts) expect(f).toMatchObject({ font: 'Arial', embedded: true });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a chart in a chosen font exports in that font, bold and italic faces included', async ({ page }) => {
  await installedFonts(page);
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
  for (const f of fonts) expect(f).toMatchObject({ font: 'Liberation Serif', embedded: true });
  const faces = await page
    .locator('svg.stat-chart')
    .evaluate((el) =>
      [...el.querySelectorAll('text')].map(
        (t) => `${getComputedStyle(t).fontWeight} ${getComputedStyle(t).fontStyle}`,
      ),
    );
  expect(new Set(faces)).toEqual(new Set(['700 normal', '400 italic']));
  // One embedded font program per face drawn.
  expect(pdf.toString('latin1').match(/\/FontFile2/g)).toHaveLength(new Set(faces).size);
  expect([...new Set(fonts.map((f) => f.size))].toSorted((a, b) => a - b)).toEqual(screen.sizes);
  await expect(page.getByRole('alert')).toHaveText(
    /The PDF uses Liberation Serif in place of Times New Roman\./,
  );
});
