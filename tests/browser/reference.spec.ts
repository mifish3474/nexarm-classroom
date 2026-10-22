import { expect, test } from '@playwright/test';

async function mockSerial(page: import('@playwright/test').Page, weak: boolean) {
  await page.addInitScript(({ weak }) => {
    Object.defineProperty(navigator, 'serial', { value: {
      requestPort: async () => {
        const bytes = [255,255,255,26,11,...Array(12).fill(0),...Array(6).fill([196,9]).flat()];
        const checksum = (~(weak ? bytes.slice(2,5) : bytes.slice(2)).reduce((a,b)=>a+b,0)) & 255;
        const packet = Uint8Array.from([...bytes,checksum]);
        let timer: ReturnType<typeof setInterval>;
        return {
          open: async () => {}, close: async () => clearInterval(timer),
          get writable() { throw new Error('Read-only inspection touched writer'); },
          readable: new ReadableStream({ start(controller) { timer = setInterval(() => controller.enqueue(packet), 100); }, cancel() { clearInterval(timer); } }),
        };
      },
    } });
  }, { weak });
}
test('teacher can capture/export an unreviewed measured reference without sending commands', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await mockSerial(page, false); await page.goto('/commissioning.html');
  await expect(page.getByRole('button', { name: 'Connect read-only' })).toBeDisabled();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Connect read-only' }).click();
  const record = page.getByRole('button', { name: 'Record draft reference' });
  await expect(record).toBeEnabled({ timeout: 5000 }); await record.click();
  await expect(page.locator('#reference-output')).toContainText('"approval": "unreviewed"');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export draft JSON' }).click();
  expect((await download).suggestedFilename()).toBe('nexarm-reference-draft.json');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect read-only' })).toBeEnabled();
  await expect(record).toBeDisabled();
  await page.getByRole('button', { name: 'Delete draft' }).click();
  await expect(page.locator('#reference-output')).toHaveText('No draft recorded.'); expect(errors).toEqual([]);
});
test('weak-checksum telemetry is diagnostic only and never records a reference', async ({ page }) => {
  await mockSerial(page, true); await page.goto('/commissioning.html');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Connect read-only' }).click();
  await expect(page.locator('#integrity-status')).toContainText('Abbreviated-only frames: 1');
  await page.waitForTimeout(1300);
  await expect(page.getByRole('button', { name: 'Record draft reference' })).toBeDisabled();
  await expect(page.locator('#reported-positions strong').first()).toHaveText('—');
});
