import { expect, test } from '@playwright/test';

test('the Workspace and Add menus open on hover, and Undo, Redo and Docs are icon buttons', async ({
  page,
}) => {
  await page.goto('/');
  const header = page.locator('header.app-header');
  const tabs = header.locator('.hover-menu > button');
  await expect(tabs).toHaveText(['Workspace', 'Add']);

  await header.getByRole('button', { name: 'Workspace' }).hover();
  await expect(page.getByRole('menuitem')).toHaveText(['New', 'Export', 'Import']);
  // Playwright's Firefox can replay its previous pointer position right after the menus change, which
  // leaves Add at once; hovering again opens it for good.
  await expect(async () => {
    await header.getByRole('button', { name: 'Add', exact: true }).hover();
    await expect(page.getByRole('menuitem')).toHaveText(['Folder', 'Files'], { timeout: 1000 });
    await expect(page.getByRole('menuitem').locator('svg')).toHaveCount(2, { timeout: 1000 });
  }).toPass();
  await header.getByRole('button', { name: 'Workspace' }).hover();
  await expect(page.getByRole('menuitem').locator('svg')).toHaveCount(3);
  await page.mouse.move(600, 400);
  await expect(page.getByRole('menu')).toHaveCount(0);

  for (const name of ['Undo', 'Redo']) {
    await expect(header.getByRole('button', { name, exact: true }).locator('svg')).toHaveCount(1);
  }
  await expect(header.getByRole('link', { name: 'Docs' }).locator('svg')).toHaveCount(1);
});

test('Workspace → Export downloads the workspace JSON', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Workspace' }).hover();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
});

test('Add → Folder and Files open the matching file pickers', async ({ page }) => {
  await page.goto('/');
  // Firefox's native picker blocks the click, so record the click on the hidden input instead.
  await page.evaluate(() => {
    const w = window as unknown as { picked: string[] };
    w.picked = [];
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      w.picked.push(this.dataset.testid ?? '');
    };
  });
  // Keyboard only: focusing the tab opens the list, Down moves along it, Enter picks.
  const add = page.locator('header').getByRole('button', { name: 'Add', exact: true });
  await add.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await add.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as unknown as { picked: string[] }).picked)).toEqual([
    'folder-input',
    'file-input',
  ]);
});

test('Undo and Redo precede Workspace, and the workspace name never overlaps the buttons', async ({
  page,
}) => {
  for (const width of [1200, 700, 520]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const header = page.locator('header.app-header');
    const box = async (loc: ReturnType<typeof header.locator>) => {
      const b = await loc.boundingBox();
      if (!b) throw new Error('not visible');
      return b;
    };
    const undo = await box(header.getByRole('button', { name: 'Undo', exact: true }));
    const redo = await box(header.getByRole('button', { name: 'Redo', exact: true }));
    const workspace = await box(header.getByRole('button', { name: 'Workspace' }));
    expect(undo.x + undo.width).toBeLessThanOrEqual(redo.x);
    expect(redo.x + redo.width).toBeLessThanOrEqual(workspace.x);

    const name = await box(header.getByLabel('Workspace name'));
    const others = header.locator('.brand, button, a');
    for (const b of await others.all()) {
      const o = await b.boundingBox();
      if (!o) continue;
      const apart =
        o.x + o.width <= name.x + 0.5 ||
        name.x + name.width <= o.x + 0.5 ||
        o.y + o.height <= name.y + 0.5 ||
        name.y + name.height <= o.y + 0.5;
      expect(apart).toBe(true);
    }
  }
});
