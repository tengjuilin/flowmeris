import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (rel: string) => resolve(here, '../fixtures', rel);

test('axis scales: hyperlog, FlowJo biex and Miltenyi with their settings', async ({ page }) => {
  await page.goto('/');
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles([fixture('flowkit/gate_ref/data1.fcs')]);
  await expect(page.getByRole('button', { name: 'All events', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('tab', { name: 'Axis' }).click();
  const y = page
    .locator('.inspector .insp-section')
    .filter({ has: page.getByRole('button', { name: 'Y axis', exact: true }) });
  await y.getByLabel('Channel').selectOption('FL1-H');
  const scale = y.getByLabel('Scale');

  await scale.selectOption('hyperlog');
  await expect(y.getByLabel('Width W')).toHaveValue('0.5');

  await scale.selectOption('biex');
  await expect(y.getByLabel('Width basis')).toHaveValue('-10');
  await expect(y.getByLabel('Positive decades')).toHaveValue('4.41854');
  await expect(y.getByLabel('Negative decades')).toHaveValue('0');
  const width = y.getByLabel('Width basis');
  await width.fill('-100');
  await width.press('Enter');
  await expect(width).toHaveValue('-100');

  await scale.selectOption('miltenyi');
  await expect(y.getByLabel('Log decades M')).toHaveValue('4');
  await expect(y.getByLabel('Linear decades L')).toHaveValue('1');
  await expect(scale).toHaveValue('miltenyi');
});
