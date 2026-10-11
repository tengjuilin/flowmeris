import { expect, test } from '@playwright/test';
import { writeFcs } from '../packages/fcs/src/write.ts';
import { downloadBytes, downloadText, parseCsv } from './helpers.ts';

/** A small FCS file whose FL1-A median is `median` (every event has that value). */
function fcs(median: number): Buffer {
  const n = 200;
  const ramp = Float32Array.from({ length: n }, (_, i) => 1000 + i);
  return Buffer.from(
    writeFcs([
      { pnn: 'FSC-A', values: ramp, range: 262144 },
      { pnn: 'FL1-A', pns: 'GFP', values: new Float32Array(n).fill(median), range: 262144 },
    ]),
  );
}

test('sample variables from a CSV, replicate means, and a chart', async ({ page }) => {
  await page.goto('/');
  // Rows A and B are replicates; columns 1 and 2 are doses 1 and 10.
  const medians: Record<string, number> = { A01: 100, A02: 200, B01: 110, B02: 220 };
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

  // Wells are read from the file names; import the design keyed by well.
  await page.getByRole('tab', { name: 'Metadata' }).click();
  await page.getByTestId('meta-input').setInputFiles({
    name: 'design.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Well,Dose,Replicate\nA1,1,r1\nA2,10,r1\nB1,1,r2\nB2,10,r2\n'),
  });
  await expect(page.getByText('4 of 4 samples matched')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 variable(s)' }).click();
  await page.getByRole('button', { name: 'Plate map' }).click();
  await expect(page.locator('.well:not(.empty)')).toHaveCount(4);
  await expect(page.locator('.well', { hasText: '10' })).toHaveCount(2);

  // Median FL1-A, then combine replicates by dose.
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await page.locator('.add-stat label', { hasText: 'Channel' }).locator('select').selectOption('FL1-A');
  await page.getByRole('button', { name: 'Add statistic' }).click();
  const settings = page.getByRole('complementary', { name: 'Statistics settings' });
  await settings.getByRole('tab', { name: 'Replicates' }).click();
  await settings.getByRole('checkbox', { name: 'Combine replicates' }).check();
  await settings.getByRole('checkbox', { name: 'Dose', exact: true }).check();
  const rows = page.locator('table.stats tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('105');
  await expect(rows.nth(1)).toContainText('210');

  // A chart of the median by dose: one mean marker per dose, with error bars.
  await page.getByRole('tab', { name: 'Charts' }).click();
  await page.getByRole('button', { name: '+ New chart' }).click();
  // The first chart plots the added statistic (the median) against the numeric variable (dose).
  await expect(page.locator('svg.stat-chart')).toContainText('Median GFP');
  // Colored by replicate, each point is one sample (no error bar); uncolored, replicates are pooled.
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(4);

  // The settings panel restyles the chart: series labels and order, legend, axis range and size.
  const panel = page.getByRole('complementary', { name: 'Chart settings' });
  await panel.getByRole('tab', { name: 'Axis' }).click();
  await panel.getByRole('textbox', { name: 'Legend label of r1' }).fill('Replicate 1');
  await expect(page.locator('svg.stat-chart .chart-legend')).toContainText('Replicate 1');
  await panel.getByRole('button', { name: 'Reverse' }).click();
  await expect(page.locator('svg.stat-chart .chart-legend text').first()).toHaveText('r2');
  const yAxis = panel.locator('.insp-section', { hasText: 'Y axis' });
  await yAxis.getByRole('spinbutton', { name: 'Max' }).fill('1000');
  await yAxis.getByRole('spinbutton', { name: 'Max' }).press('Enter');
  await expect(page.locator('svg.stat-chart .chart-axis')).toContainText('1K');
  await panel.getByRole('tab', { name: 'Text' }).click();
  await panel.getByRole('combobox', { name: 'Position', exact: true }).selectOption('none');
  await expect(page.locator('svg.stat-chart .chart-legend')).toHaveCount(0);
  await panel.getByRole('tab', { name: 'Figure' }).click();
  await panel.getByRole('spinbutton', { name: 'Height (px)' }).fill('300');
  await panel.getByRole('spinbutton', { name: 'Height (px)' }).press('Enter');
  await expect(page.locator('svg.stat-chart')).toHaveAttribute('height', '300');
  await page.screenshot({ path: 'test-results/charts-panel.png' });

  await panel.getByRole('tab', { name: 'Axis' }).click();
  await panel.getByRole('combobox', { name: 'Color by' }).selectOption('');
  await expect(page.locator('svg.stat-chart .chart-err')).toHaveCount(2);
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(2);

  // Exports, from the one Export menu: the plotted means as CSV, and a 300 dpi PNG (pixel size and pHYs chunk).
  const exportAs = async (format: string) => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('combobox', { name: 'Format' }).selectOption(format);
    await page.getByRole('button', { name: 'Download' }).click();
  };
  const csv = await downloadText(page, () => exportAs('csv'));
  expect(csv.name).toMatch(/_data\.csv$/);
  const [header, ...points] = parseCsv(csv.text);
  expect(header).toEqual(['Dose', 'All events | Median GFP (FL1-A) (mean)', 'SEM', 'n']);
  expect(points.map((r) => r.map(Number))).toEqual([
    [1, 105, expect.closeTo(5, 9), 2],
    [10, 210, expect.closeTo(10, 9), 2],
  ]);
  const png = await downloadBytes(page, () => exportAs('png'));
  expect(png.bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  const svgW = Number(await page.locator('svg.stat-chart').getAttribute('width'));
  expect(png.bytes.readUInt32BE(16)).toBe(Math.round((svgW * 300) / 96));
  expect(png.bytes.readUInt32BE(20)).toBe(Math.round((300 * 300) / 96));
  const phys = png.bytes.indexOf('pHYs');
  expect(phys).toBeGreaterThan(0);
  expect(png.bytes.readUInt32BE(phys + 4)).toBe(Math.round(300 / 0.0254));
});
