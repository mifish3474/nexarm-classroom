import { expect, test } from '@playwright/test';

test('bounded simulation, cancellation, and reset work without USB or data connections', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serial', { get() { throw new Error('Simulation attempted USB access'); } });
  });
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Illustrated virtual arm/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your virtual robot' })).toBeVisible();
  await page.getByRole('button', { name: 'Run program' }).click();
  await expect(page.getByRole('button', { name: 'Run program' })).toBeDisabled();
  await expect(page.locator('#instructions .active')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#state')).toHaveText('Stopped');
  const stopped = await page.locator('.joint-card strong').allTextContents();
  await page.waitForTimeout(200);
  expect(await page.locator('.joint-card strong').allTextContents()).toEqual(stopped);
  await page.getByRole('button', { name: 'Reset Simulation' }).click();
  expect(await page.locator('.joint-card strong').allTextContents()).toEqual(Array(6).fill('2048'));
  await page.getByRole('button', { name: 'Run program' }).click();
  await expect(page.locator('#state')).toHaveText('Completed', { timeout: 8000 });
  expect(await page.locator('.joint-card strong').allTextContents()).toEqual(Array(6).fill('2048'));
  expect(errors).toEqual([]);
  expect(requests.every(url => /^http:\/\/127\.0\.0\.1:4173\/(?:$|assets\/|blockly-media\/|favicon.svg$)/.test(url))).toBe(true);
  await page.screenshot({ path: 'test-results/lesson-preview.png', fullPage: true });
});

test('small Chromebook layout fits without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 720 });
  await page.goto('/');
  const before = await page.locator('#arm-illustration line').first().getAttribute('x2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Simulate joint 2 plus 20 raw units' }).click();
  await expect(page.locator('.joint-card strong').nth(1)).toHaveText('2068');
  expect(await page.locator('#arm-illustration line').first().getAttribute('x2')).not.toEqual(before);
  await expect(page.locator('#instructions .active')).toHaveCount(0);
});

test('keyboard lesson fields change the Blockly program and loop execution', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Program steps and keyboard editing', { exact: true }).click();
  const count = page.getByRole('spinbutton', { name: /repeat count/ });
  await count.fill('3'); await count.press('Tab');
  await page.getByRole('button', { name: 'Run program' }).click();
  await expect(page.locator('#state')).toHaveText('Completed', { timeout: 10000 });
  await expect(page.locator('#instructions li')).toHaveCount(8);
});

test('reduced-motion illustration waits until simulation ends', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Animate arm illustration' })).not.toBeChecked();
  await expect(page.getByText(/Your device requests reduced motion/)).toBeVisible();
  const before = await page.locator('#arm-illustration line').first().getAttribute('x2');
  await page.getByRole('button', { name: 'Simulate joint 2 plus 20 raw units' }).click();
  expect(await page.locator('#arm-illustration line').first().getAttribute('x2')).toEqual(before);
  await expect(page.locator('#state')).toHaveText('Completed');
  expect(await page.locator('#arm-illustration line').first().getAttribute('x2')).not.toEqual(before);
});

test('a reduced-motion user can explicitly enable visible animation during the starter', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await page.getByRole('checkbox', { name: 'Animate arm illustration' }).check();
  const base = page.locator('#arm-illustration [data-joint="1"]');
  const initial = await base.getAttribute('transform');
  await page.getByRole('button', { name: 'Run program' }).click();
  await expect.poll(() => base.getAttribute('transform')).not.toEqual(initial);
  await expect(page.locator('#state')).toHaveText('Running');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const stopped = await base.getAttribute('transform');
  await page.waitForTimeout(150);
  expect(await base.getAttribute('transform')).toEqual(stopped);
});
