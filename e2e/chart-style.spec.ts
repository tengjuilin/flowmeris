import { type Page, expect, test } from '@playwright/test';
import { importDesign, loadWells } from './helpers.ts';

/** A dot chart of a statistic by dose; returns the chart settings panel. */
async function openChart(page: Page) {
  await loadWells(page, { A01: 100, A02: 200, B01: 110, B02: 220 });
  await importDesign(page, 'Well,Dose,Cond\nA1,1,ctrl\nA2,10,ctrl\nB1,1,drug\nB2,10,drug\n', 2);
  await page.getByRole('tab', { name: 'Statistics' }).click();
  await page.locator('.add-stat label', { hasText: 'Channel' }).locator('select').selectOption('FL1-A');
  await page.getByRole('button', { name: 'Add statistic' }).click();
  await page.getByRole('tab', { name: 'Charts' }).click();
  await page.getByRole('button', { name: '+ New chart' }).click();
  const panel = page.getByRole('complementary', { name: 'Chart settings' });
  await panel.getByRole('combobox', { name: 'Chart type' }).selectOption('dot');
  // Not coloured by condition, so each dose has two replicates and an error bar.
  await panel.getByRole('tab', { name: 'Axis' }).click();
  await panel
    .locator('.insp-section', { hasText: 'X axis' })
    .getByRole('combobox', { name: 'Column' })
    .selectOption({ label: 'Dose' });
  await panel.getByRole('combobox', { name: 'Colour by' }).selectOption('');
  await panel.getByRole('tab', { name: 'Figure' }).click();
  return panel;
}

const chart = (page: Page) => page.locator('svg.stat-chart');

test('chart number fields apply while typing, in one undo step', async ({ page }) => {
  const panel = await openChart(page);
  const height = panel.getByRole('spinbutton', { name: 'Height (px)' });
  await height.focus();
  await height.pressSequentially('0', { delay: 20 }); // 440 → 4400
  await height.fill('300');
  // Still focused: no blur or Enter yet.
  await expect(height).toBeFocused();
  await expect(chart(page)).toHaveAttribute('height', '300');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(chart(page)).toHaveAttribute('height', '440');
});

test('marker shape, the horizontal-line marker, edge and error bar colours', async ({ page }) => {
  const panel = await openChart(page);
  // One mean marker per point; each point has a hover target.
  const n = await chart(page).locator('.chart-hit').count();
  expect(n).toBeGreaterThan(0);
  await panel.getByRole('combobox', { name: 'Marker shape' }).selectOption('diamond');
  await expect(chart(page).locator('path[stroke-linejoin="round"]')).toHaveCount(n);
  await panel.getByLabel('Marker edge colour', { exact: true }).fill('#123456');
  await expect(chart(page).locator('path[stroke="#123456"]')).toHaveCount(n);
  await expect(chart(page).locator('circle.chart-rep').first()).toHaveAttribute('stroke', '#123456');

  await panel.getByRole('combobox', { name: 'Marker shape' }).selectOption('hline');
  const lines = chart(page).locator('.chart-mean-line');
  await expect(lines).toHaveCount(n);
  await panel.getByRole('spinbutton', { name: 'Mean line width (px)' }).fill('4');
  await panel.getByRole('spinbutton', { name: 'Mean line length (px)' }).fill('30');
  await expect(lines.first()).toHaveAttribute('stroke-width', '4');
  const [x1, x2] = await lines.first().evaluate((l) => [l.getAttribute('x1'), l.getAttribute('x2')]);
  expect(Number(x2) - Number(x1)).toBe(30);
  await panel.getByLabel('Mean line colour', { exact: true }).fill('#000000');
  await expect(lines.first()).toHaveAttribute('stroke', '#000000');
  await panel.getByRole('button', { name: "Reset mean line colour to the series' colours" }).click();
  await expect(lines.first()).not.toHaveAttribute('stroke', '#000000');

  await panel.getByLabel('Error bar colour', { exact: true }).fill('#aa0000');
  await expect(chart(page).locator('.chart-err line').first()).toHaveCSS('stroke', 'rgb(170, 0, 0)');
  await page.screenshot({ path: 'test-results/chart-marks.png' });
});

test('ticks and spines, the box aspect ratio, and the series list buttons', async ({ page }) => {
  const panel = await openChart(page);
  await panel.getByRole('tab', { name: 'Axis' }).click();
  await panel.getByLabel('Spine colour', { exact: true }).fill('#0000aa');
  await panel.getByRole('spinbutton', { name: 'Spine width (px)' }).fill('3');
  await expect(chart(page).locator('.chart-spine').first()).toHaveCSS('stroke', 'rgb(0, 0, 170)');
  await expect(chart(page).locator('.chart-spine').first()).toHaveCSS('stroke-width', '3px');

  await panel.getByRole('checkbox', { name: 'Free box aspect ratio' }).uncheck();
  await panel.getByRole('spinbutton', { name: 'Box width ÷ height' }).fill('2');
  const [w, h] = await chart(page)
    .locator('.chart-spine')
    .evaluateAll((ls) =>
      ls.map((l) => {
        const b = (l as SVGLineElement).getBBox();
        return Math.max(b.width, b.height);
      }),
    )
    .then((v) => [Math.max(...v), Math.min(...v)]);
  expect(w! / h!).toBeCloseTo(2, 1);

  const colour = panel.locator('.insp-section', { hasText: 'Colour by' });
  await colour.getByRole('combobox', { name: 'Colour by' }).selectOption({ label: 'Cond' });
  await expect(colour.getByRole('button', { name: 'Reverse' }).locator('svg')).toHaveCount(1);
  for (const name of ['Reset the order', 'Reset the colours', 'Reset the labels'])
    await expect(colour.getByRole('button', { name }).locator('svg')).toHaveCount(1);
  await colour.getByRole('button', { name: 'Reverse' }).click();
  await expect(colour.getByRole('button', { name: 'Reset the order' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/chart-axis.png' });
});
