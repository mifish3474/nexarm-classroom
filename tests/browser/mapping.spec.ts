import { expect, test } from '@playwright/test';

test('approved teacher sequence writes one fixed frame and cannot be restored by reload', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: number[][] = [];
    Object.assign(window, { mappingWrites: writes });
    Object.defineProperty(navigator, 'serial', { value: { requestPort: async () => {
      let timer: ReturnType<typeof setInterval>;
      let position = 2050;
      return {
        open: async () => {}, close: async () => clearInterval(timer),
        readable: new ReadableStream<Uint8Array>({ start(controller) {
          timer = setInterval(() => {
            const body = [255,26,11,...Array(12).fill(0),...[position,2048,2047,2048,2042,2053].flatMap(n => [n & 255,n >> 8])];
            controller.enqueue(Uint8Array.from([255,255,...body,(~body.reduce((a,b) => a+b,0)) & 255]));
          },100);
        }, cancel() { clearInterval(timer); } }),
        writable: new WritableStream<Uint8Array>({ write(bytes) { writes.push([...bytes]); position = 2063; } }),
      };
    } } });
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/mapping.html');
  const writes = () => page.evaluate(() => (window as unknown as { mappingWrites: number[][] }).mappingWrites);
  expect(await writes()).toEqual([]);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Connect for approved test' }).click();
  const enable = page.getByRole('button', { name: 'Enable one attempt' });
  const send = page.getByRole('button', { name: 'Send single test: servo 1 to 2068' });
  await expect(enable).toBeEnabled({ timeout: 5000 }); expect(await writes()).toEqual([]);
  await enable.click(); await expect(send).toBeEnabled(); expect(await writes()).toEqual([]);
  await send.click(); await expect(send).toBeDisabled();
  await expect(page.locator('#mapping-phase')).toContainText('Complete');
  expect(await writes()).toEqual([[255,255,1,5,3,42,20,8,176]]);
  await page.getByRole('button', { name: 'Stop / Disconnect' }).click();
  await page.reload();
  await expect(page.locator('#mapping-gate')).toContainText('already been consumed');
  await expect(enable).toBeDisabled(); await expect(send).toBeDisabled();
  expect(await writes()).toEqual([]); expect(errors).toEqual([]);
});
