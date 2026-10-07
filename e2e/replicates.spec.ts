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

test('choosing which grouped replicates the ridge plot and charts show', async ({ page }) => {
  await page.goto('/');
  // Rows A–C are replicates; columns 1 and 2 are doses 1 and 10. C02 is an outlier.
  const medians: Record<string, number> = { A01: 100, A02: 200, B01: 110, B02: 220, C01: 120, C02: 900 };
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
  await page.getByRole('tab', { name: 'Metadata' }).click();
  await page.getByTestId('meta-input').setInputFiles({
    name: 'design.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Well,Dose,Replicate\nA1,1,r1\nA2,10,r1\nB1,1,r2\nB2,10,r2\nC1,1,r3\nC2,10,r3\n'),
  });
  await page.getByRole('button', { name: 'Import 2 variable(s)' }).click();

  // Ridge: combine by dose, hide one combined ridge, then exclude a replicate from the other.
  await page.getByRole('tab', { name: 'Ridge' }).click();
  const card = page.getByRole('region', { name: 'Replicates' });
  await card.getByRole('checkbox', { name: 'Dose' }).check();
  await expect(page.locator('svg.ridge .ridge-label')).toHaveCount(2);
  await card.getByRole('checkbox', { name: '10', exact: true }).uncheck();
  await expect(page.locator('svg.ridge .ridge-label')).toHaveCount(1);
  await card.getByRole('button', { name: 'Replicates of 1', exact: true }).click();
  await card.getByRole('checkbox', { name: 'A01' }).uncheck();
  await expect(card.locator('.group-picker-row').first()).toContainText('2 of 3');
  await expect(card).toContainText('1 hidden, 1 replicate excluded');
  await page.screenshot({ path: 'test-results/ridge-replicates.png' });
  await card.getByRole('button', { name: 'Show all' }).click();
  await expect(page.locator('svg.ridge .ridge-label')).toHaveCount(2);

  // Charts: median by dose, replicates pooled; leave out the outlier, then hide dose 1.
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await page.locator('.add-stat label', { hasText: 'Channel' }).locator('select').selectOption('FL1-A');
  await page.getByRole('button', { name: 'Add statistic' }).click();
  await page.getByRole('tab', { name: 'Charts' }).click();
  await page.getByRole('button', { name: '+ New chart' }).click();
  await page.locator('.chart-controls label', { hasText: 'Colour by' }).locator('select').selectOption('');
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(2);
  const data = page.locator('details.chart-data');
  await data.locator('summary').click();
  await expect(data.locator('tbody tr').nth(1)).toContainText('440');

  const groups = page.getByRole('complementary', { name: 'Chart settings' }).locator('fieldset', {
    hasText: 'Groups',
  });
  await groups.getByRole('button', { name: 'Replicates of 10' }).click();
  await groups.getByRole('checkbox', { name: /C02/ }).uncheck();
  await expect(data.locator('tbody tr').nth(1)).toContainText('210');
  await expect(data.locator('tbody tr').nth(1)).not.toContainText('900');
  await groups.getByRole('checkbox', { name: '1', exact: true }).uncheck();
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(1);
  await expect(data.locator('tbody tr')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/chart-groups.png' });

  // Clicking a row's name toggles it; Shift-click sets a range like the clicked row.
  await groups.getByRole('button', { name: 'Show all' }).click();
  await expect(data.locator('tbody tr')).toHaveCount(2);
  await groups.locator('.group-picker-row', { hasText: 'A02' }).locator('.group-picker-label').click();
  await groups.locator('.group-picker-row', { hasText: 'C02' }).click({ modifiers: ['Shift'] });
  await expect(groups.getByRole('checkbox', { name: 'B02' })).not.toBeChecked();
  await expect(data.locator('tbody tr')).toHaveCount(1);
  await groups.getByRole('button', { name: 'Replicates of 10' }).click();
  await groups.locator('.group-picker-row').nth(0).click();
  await groups
    .locator('.group-picker-row')
    .nth(1)
    .click({ modifiers: ['Shift'] });
  await expect(groups).toContainText('2 hidden');
});
