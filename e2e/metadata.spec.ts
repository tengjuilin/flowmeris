import { expect, test } from '@playwright/test';
import { writeFcs } from '../packages/fcs/src/write.ts';

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
  await expect(page.getByText('All events')).toBeVisible({ timeout: 20_000 });

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
  await page.locator('.analysis-section label', { hasText: 'Combine replicates' }).locator('input').check();
  await page
    .locator('.analysis-section label', { hasText: /^Dose$/ })
    .locator('input')
    .check();
  const rows = page.locator('table.stats tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('105');
  await expect(rows.nth(1)).toContainText('210');

  // A chart of the median by dose: one mean marker per dose, with error bars.
  await page.getByRole('tab', { name: 'Charts' }).click();
  await page.getByRole('button', { name: '+ New chart' }).click();
  // The first chart plots the added statistic (the median) against the numeric variable (dose).
  await expect(page.locator('svg.stat-chart')).toContainText('Median GFP');
  // Coloured by replicate, each point is one sample (no error bar); uncoloured, replicates are pooled.
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(4);
  await page.locator('.chart-controls label', { hasText: 'Colour by' }).locator('select').selectOption('');
  await expect(page.locator('svg.stat-chart .chart-err')).toHaveCount(2);
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(2);
});
