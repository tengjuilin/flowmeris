import { expect, test } from '@playwright/test';
import { importDesign, loadWells } from './helpers.ts';

test('chart tabs, the tabbed settings panel, and the Groups and Export cards', async ({ page }) => {
  await loadWells(page, { A01: 100, A02: 200, B01: 110, B02: 220 });
  await importDesign(page, 'Well,Dose,Replicate\nA1,1,r1\nA2,10,r1\nB1,1,r2\nB2,10,r2\n', 2);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await page.locator('.add-stat label', { hasText: 'Channel' }).locator('select').selectOption('FL1-A');
  await page.getByRole('button', { name: 'Add statistic' }).click();

  await page.getByRole('tab', { name: 'Charts' }).click();
  const panel = page.getByRole('complementary', { name: 'Chart settings' });
  await expect(panel).toContainText('Add a chart');
  await page.getByRole('button', { name: '+ New chart' }).click();
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(4);

  // The settings sit in the panel's tabs; the old toolbar and its separate export buttons are gone.
  const tabs = page.getByRole('tablist', { name: 'Charts' });
  await expect(tabs.getByRole('tab')).toHaveText(['Chart 1']);
  await expect(panel.getByRole('tab')).toHaveText(['Figure', 'Axis', 'Text', 'Settings']);
  await expect(page.getByRole('button', { name: 'SVG', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Format' }).locator('option')).toHaveText([
    'PDF (vector)',
    'PNG',
    'JPG',
    'SVG (vector)',
    'CSV (plotted data)',
  ]);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Groups' })).toBeVisible();

  // Figure tab: renaming the chart renames its tab; the chart type is a select.
  await panel.getByRole('textbox', { name: 'Name' }).fill('Dose response');
  await expect(tabs.getByRole('tab', { selected: true })).toHaveText('Dose response');
  await panel.getByRole('combobox', { name: 'Chart type' }).selectOption('bar');
  await expect(page.locator('svg.stat-chart .chart-hit')).toHaveCount(4);

  // Axis tab: the y scale, then "Reset this panel" puts it back.
  await panel.getByRole('tab', { name: 'Axis' }).click();
  const yAxis = panel.locator('.insp-section', { hasText: 'Y axis' });
  await yAxis.getByRole('combobox', { name: 'Scale' }).selectOption('log10');
  const resetPanel = panel.getByRole('button', { name: 'Reset the settings in this panel' });
  await expect(resetPanel).toBeEnabled();
  await resetPanel.click();
  await expect(yAxis.getByRole('combobox', { name: 'Scale' })).toHaveValue('linear');
  await expect(resetPanel).toBeDisabled();

  // + adds a chart and shows it; Settings › Duplicate copies the open one.
  await tabs.getByRole('button', { name: 'New chart' }).click();
  await expect(tabs.getByRole('tab')).toHaveText(['Dose response', 'Chart 2']);
  await expect(tabs.getByRole('tab', { selected: true })).toHaveText('Chart 2');
  await tabs.getByRole('tab', { name: 'Dose response' }).click();
  await panel.getByRole('tab', { name: 'Settings' }).click();
  await panel.getByRole('button', { name: /Add a copy of this chart/ }).click();
  await expect(tabs.getByRole('tab')).toHaveText(['Dose response', 'Chart 2', 'Dose response copy']);
  await expect(tabs.getByRole('tab', { selected: true })).toHaveText('Dose response copy');

  // Apply the open chart's settings to all charts.
  await panel.getByRole('tab', { name: 'Text' }).click();
  await panel.getByRole('combobox', { name: 'Position', exact: true }).selectOption('right');
  await panel.getByRole('tab', { name: 'Settings' }).click();
  const apply = panel.getByRole('button', { name: /Give every chart of this group/ });
  await apply.click();
  await expect(apply).toBeDisabled();
  await tabs.getByRole('tab', { name: 'Chart 2' }).click();
  await panel.getByRole('tab', { name: 'Text' }).click();
  await expect(panel.getByRole('combobox', { name: 'Position', exact: true })).toHaveValue('right');
  await page.screenshot({ path: 'test-results/charts-tabs.png' });

  // × on a tab deletes that chart; deleting the open one shows its neighbour. Undo brings it back.
  await tabs.getByRole('button', { name: 'Delete chart' }).nth(1).click();
  await expect(tabs.getByRole('tab')).toHaveText(['Dose response', 'Dose response copy']);
  await expect(tabs.getByRole('tab', { selected: true })).toHaveText('Dose response copy');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(tabs.getByRole('tab')).toHaveText(['Dose response', 'Chart 2', 'Dose response copy']);
  for (let i = 0; i < 3; i++) await tabs.getByRole('button', { name: 'Delete chart' }).first().click();
  await expect(page.getByRole('button', { name: '+ New chart' })).toBeVisible();
  await expect(panel).toContainText('Add a chart');
});
