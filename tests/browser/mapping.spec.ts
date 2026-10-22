import { expect, test } from '@playwright/test';

test('staged return previews without writing, then settles eight waypoints and exports its result', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: number[][] = [], positions = [2046,2009,1943,2048,2044,2052];
    Object.assign(window,{mappingWrites:writes});
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{
      let timer: ReturnType<typeof setInterval>;
      return {open:async()=>{},close:async()=>clearInterval(timer),
        readable:new ReadableStream<Uint8Array>({start(controller){timer=setInterval(()=>{
          const body=[255,26,11,...Array(12).fill(0),...positions.flatMap(n=>[n&255,n>>8])];
          controller.enqueue(Uint8Array.from([255,255,...body,(~body.reduce((a,b)=>a+b,0))&255]));
        },100);},cancel(){clearInterval(timer);}}),
        writable:new WritableStream<Uint8Array>({write(bytes){writes.push([...bytes]);positions[bytes[2]!-1]=bytes[6]!+256*bytes[7]!;}})};
    }}});
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/mapping.html');
  const writes=()=>page.evaluate(()=>(window as unknown as {mappingWrites:number[][]}).mappingWrites);
  await page.locator('#mapping-setup').check();await page.getByRole('button',{name:'Connect for joint tests'}).click();
  await page.locator('#home-clear').check();
  const enable=page.getByRole('button',{name:'Enable staged return'});
  await expect(enable).toBeEnabled();await expect(page.locator('#mapping-enable')).toBeDisabled();
  await expect(page.locator('#mapping-home-proposal')).toContainText('8. Servo 3');
  expect(await writes()).toEqual([]);await enable.click();expect(await writes()).toEqual([]);
  await expect(page.locator('#mapping-joint')).toBeDisabled();
  await page.getByRole('button',{name:'Start staged return'}).click();
  await expect(page.locator('#home-state')).toContainText('Complete:',{timeout:15000});
  expect((await writes()).map(bytes=>[bytes[2],bytes[6]!+256*bytes[7]!])).toEqual([[2,2029],[2,2048],[3,1960],[3,1978],[3,1995],[3,2012],[3,2030],[3,2047]]);
  await expect(enable).toBeDisabled();await expect(page.locator('#mapping-enable')).toBeEnabled();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export all joint observations'}).click();await download;
  await expect(page.locator('#mapping-report')).toContainText('"completedWaypoints": 8');
  await page.getByRole('button',{name:'Stop / Disconnect'}).click();
  page.on('dialog',dialog=>dialog.accept());await page.reload();expect(await writes()).toEqual([]);
  await page.locator('#mapping-setup').check();await page.getByRole('button',{name:'Connect for joint tests'}).click();
  await page.locator('#home-clear').check();await expect(page.locator('#home-state')).toContainText('consumed');await expect(enable).toBeDisabled();expect(await writes()).toEqual([]);
  await page.getByRole('button',{name:'Stop / Disconnect'}).click();expect(errors).toEqual([]);
});

test('one connection supports five deliberate tests with per-joint observations and independent reload lockouts', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: number[][] = [], positions = [2066,2044,2043,2049,2043,2053];
    Object.assign(window,{mappingWrites:writes});
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{
      let timer: ReturnType<typeof setInterval>;
      return {open:async()=>{},close:async()=>clearInterval(timer),
        readable:new ReadableStream<Uint8Array>({start(controller){timer=setInterval(()=>{
          const body=[255,26,11,...Array(12).fill(0),...positions.flatMap(n=>[n&255,n>>8])];
          controller.enqueue(Uint8Array.from([255,255,...body,(~body.reduce((a,b)=>a+b,0))&255]));
        },100);},cancel(){clearInterval(timer);}}),
        writable:new WritableStream<Uint8Array>({write(bytes){writes.push([...bytes]);positions[bytes[2]!-1]=bytes[6]!+256*bytes[7]!-2;}})};
    }}});
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/mapping.html');
  const writes=()=>page.evaluate(()=>(window as unknown as {mappingWrites:number[][]}).mappingWrites);
  const setup=page.getByRole('checkbox',{name:'I reviewed clearance and cutoff conditions for this selected joint.'});
  await setup.check();await page.getByRole('button',{name:'Connect for joint tests'}).click();
  for(const [servo,target] of [[2,2064],[3,2063],[4,2069],[5,2063],[6,2073]]){
    if(servo!==2){await page.getByRole('combobox',{name:'Selected joint'}).selectOption(String(servo));await expect(setup).not.toBeChecked();await setup.check();}
    const enable=page.getByRole('button',{name:'Enable one attempt'});
    if(servo===6){await expect(enable).toBeDisabled();await page.getByRole('checkbox',{name:'The gripper is empty and its pinch area is clear.'}).check();}
    await expect(enable).toBeEnabled({timeout:5000});expect((await writes()).length).toBe(servo!-2);
    await enable.click();const send=page.getByRole('button',{name:`Send single test: servo ${servo} to ${target}`});
    await send.click();await expect(send).toBeDisabled();await expect(page.locator('#mapping-phase')).toContainText('Complete');
    await page.getByRole('textbox',{name:'Physical joint that moved'}).fill(`Observed joint ${servo}`);
    await page.getByRole('textbox',{name:'Direction and viewpoint'}).fill('Positive direction from marked side');
  }
  expect((await writes()).map(frame=>frame[2])).toEqual([2,3,4,5,6]);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export all joint observations'}).click();
  expect((await download).suggestedFilename()).toBe('nexarm-joint-suite-report.json');
  await expect(page.locator('#mapping-report')).toContainText('Observed joint 6');
  await page.getByRole('button',{name:'Stop / Disconnect'}).click();
  page.on('dialog',dialog=>dialog.accept());await page.reload();
  await expect(page.locator('#mapping-gate')).toContainText('already been consumed');
  await expect(page.getByRole('button',{name:'Enable one attempt'})).toBeDisabled();expect(await writes()).toEqual([]);expect(errors).toEqual([]);
});
