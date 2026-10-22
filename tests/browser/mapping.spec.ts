import { expect, test } from '@playwright/test';

test('manual positioning releases and restores without a position command and retains its interlock on reload',async({page})=>{
  await page.addInitScript(()=>{
    const writes:number[][]=[],positions=[2066,2044,2043,2049,2043,2053];
    Object.assign(window,{mappingWrites:writes,manualPlace:(pose:number[])=>positions.splice(0,6,...pose)});
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{
      let timer:ReturnType<typeof setInterval>;
      return {open:async()=>{},close:async()=>clearInterval(timer),
        readable:new ReadableStream<Uint8Array>({start(controller){timer=setInterval(()=>{
          const body=[255,26,11,...Array(12).fill(0),...positions.flatMap(n=>[n&255,n>>8])];
          controller.enqueue(Uint8Array.from([255,255,...body,(~body.reduce((a,b)=>a+b,0))&255]));
        },100);},cancel(){clearInterval(timer);}}),
        writable:new WritableStream<Uint8Array>({write(bytes){writes.push([...bytes]);}})};
    }}});
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/mapping.html');
  const writes=()=>page.evaluate(()=>(window as unknown as {mappingWrites:number[][]}).mappingWrites);
  await page.locator('#mapping-setup').check();await page.locator('#mapping-connect').click();
  await page.locator('#manual-support').check();await expect(page.locator('#manual-enable')).toBeEnabled();await page.locator('#manual-enable').click();
  expect(await writes()).toEqual([]);await expect(page.locator('#mapping-enable')).toBeDisabled();await expect(page.locator('#mapping-joint')).toBeDisabled();
  await page.locator('#manual-release').click();await expect(page.locator('#manual-state')).toContainText('Manual setup:');
  expect(await writes()).toEqual([[255,255,255,3,61,0,192]]);await expect(page.locator('#home-enable')).toBeDisabled();
  await page.evaluate(()=>(window as unknown as {manualPlace:(pose:number[])=>void}).manualPlace([2048,2048,2047,2048,2042,2053]));
  await expect(page.locator('#manual-restore')).toBeEnabled();await page.locator('#manual-restore').click();await expect(page.locator('#manual-state')).toContainText('Confirm holding:');
  expect(await writes()).toEqual([[255,255,255,3,61,0,192],[255,255,255,3,61,1,191]]);
  await expect(page.locator('#mapping-enable')).toBeDisabled();await page.locator('#manual-held').check();
  await expect(page.locator('#manual-confirm')).toBeEnabled();await page.locator('#manual-confirm').click();
  await expect(page.locator('#manual-state')).toContainText('Normal:');await expect(page.locator('#mapping-setup')).not.toBeChecked();
  await page.locator('#mapping-setup').check();await expect(page.locator('#mapping-enable')).toBeEnabled();
  await page.locator('#manual-support').check();await page.locator('#manual-enable').click();await page.locator('#manual-release').click();
  await expect(page.locator('#manual-state')).toContainText('Manual setup:');await page.locator('#mapping-stop').click();
  page.on('dialog',dialog=>dialog.accept());await page.reload();expect(await writes()).toEqual([]);
  await expect(page.locator('#manual-state')).toContainText('Recovery required:');await page.locator('#mapping-setup').check();await page.locator('#mapping-connect').click();
  await expect(page.locator('#mapping-enable')).toBeDisabled();await expect(page.locator('#home-enable')).toBeDisabled();
  await page.locator('#manual-held').check();await expect(page.locator('#manual-confirm')).toBeEnabled();
  // Teacher reports factory holding was restored externally: confirmation sends nothing.
  await page.locator('#manual-confirm').click();expect(await writes()).toEqual([]);
  const download=page.waitForEvent('download');await page.locator('#mapping-export').click();await download;
  await expect(page.locator('#mapping-report')).toContainText('manualPositioning');await page.locator('#mapping-stop').click();expect(errors).toEqual([]);
});

test('teacher recovery renews individual attempts with fresh evidence and preserves earlier markers',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('nexarm.approval.joint-suite.servo2.positive.2026-10-22','prior joint attempt');
    localStorage.setItem('nexarm.approval.staged-reference-a.2026-10-22','prior return attempt');
    const writes:number[][]=[],positions=[2048,2055,2056,2056,2050,2061];Object.assign(window,{mappingWrites:writes});
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{
      let timer:ReturnType<typeof setInterval>;
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
  const setup=page.locator('#mapping-setup');await setup.check();await page.locator('#mapping-connect').click();
  await expect(page.locator('#mapping-enable')).toBeDisabled();await page.locator('#recovery-reviewed').check();
  await expect(page.locator('#retry-joint')).toBeEnabled();await page.locator('#retry-joint').click();
  expect(await writes()).toEqual([]);await expect(setup).not.toBeChecked();await expect(page.locator('#mapping-enable')).toBeDisabled();
  await setup.check();await expect(page.locator('#mapping-enable')).toBeEnabled();await page.locator('#mapping-enable').click();
  await expect(page.locator('#mapping-send')).toHaveText('Send single test: servo 2 to 2075');await page.locator('#mapping-send').click();
  await expect(page.locator('#mapping-phase')).toContainText('Complete');expect(await writes()).toHaveLength(1);
  await page.locator('#recovery-reviewed').check();await expect(page.locator('#retry-return')).toBeEnabled({timeout:5000});await page.locator('#retry-return').click();
  expect(await writes()).toHaveLength(1);await page.locator('#home-clear').check();
  await expect(page.locator('#home-enable')).toBeEnabled();await page.locator('#home-enable').click();await page.locator('#home-start').click();
  await expect(page.locator('#home-state')).toContainText('Complete:');expect(await writes()).toHaveLength(3);
  const download=page.waitForEvent('download');await page.locator('#mapping-export').click();await download;
  await expect(page.locator('#mapping-report')).toContainText('prior return attempt');await expect(page.locator('#mapping-report')).toContainText('prior joint attempt');
  const markers=await page.evaluate(()=>[localStorage.getItem('nexarm.approval.joint-suite.servo2.positive.2026-10-22'),localStorage.getItem('nexarm.approval.staged-reference-a.2026-10-22')]);
  expect(markers).toEqual(['prior joint attempt','prior return attempt']);await page.locator('#mapping-stop').click();expect(errors).toEqual([]);
});

test('staged return previews without writing, then settles ten waypoints and exports its result', async ({ page }) => {
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
  await expect(page.locator('#mapping-home-proposal')).toContainText('10. Servo 3');
  expect(await writes()).toEqual([]);await enable.click();expect(await writes()).toEqual([]);
  await expect(page.locator('#mapping-joint')).toBeDisabled();
  await page.getByRole('button',{name:'Start staged return'}).click();
  await expect(page.locator('#home-state')).toContainText('Complete:',{timeout:15000});
  expect((await writes()).map(bytes=>[bytes[2],bytes[6]!+256*bytes[7]!])).toEqual([[2,2022],[2,2035],[2,2048],[3,1958],[3,1973],[3,1988],[3,2002],[3,2017],[3,2032],[3,2047]]);
  await expect(enable).toBeDisabled();await expect(page.locator('#mapping-enable')).toBeEnabled();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export all joint observations'}).click();await download;
  await expect(page.locator('#mapping-report')).toContainText('"completedWaypoints": 10');
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
  await expect(page.locator('#mapping-gate')).toContainText('Teacher recovery');
  await expect(page.getByRole('button',{name:'Enable one attempt'})).toBeDisabled();expect(await writes()).toEqual([]);expect(errors).toEqual([]);
});
