import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function robot(page: Page, initial = [2050,2150,2100,2200,2000,1080]) {
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.addInitScript(pose => {
    const positions = [...pose], writes: {at:number;bytes:number[]}[] = [];
    const state = {positions, writes, paused:false}; Object.assign(window, {teacherRobot:state});
    Object.defineProperty(navigator, 'serial', {value:{requestPort: async () => {
      let timer: ReturnType<typeof setInterval>;
      return {open:async()=>{}, close:async()=>clearInterval(timer),
        readable:new ReadableStream<Uint8Array>({start(controller) { timer=setInterval(()=>{
          if (state.paused) return;
          const body=[255,26,11,...Array(12).fill(0),...positions.flatMap(n=>[n&255,n>>8])];
          controller.enqueue(Uint8Array.from([255,255,...body,(~body.reduce((a,b)=>a+b,0))&255]));
        },100); },cancel(){clearInterval(timer);}}),
        writable:new WritableStream<Uint8Array>({write(bytes){
          writes.push({at:performance.now(),bytes:[...bytes]});
          if(bytes[2]!>=1&&bytes[2]!<=6&&bytes[5]===42){const i=bytes[2]!-1,target=bytes[6]!+256*bytes[7]!;positions[i]=target-Math.sign(target-positions[i]!)*5;}
        }})};
    }}});
  }, initial);
  await page.goto('/mapping.html');
}
async function connect(page:Page) {
  await page.getByRole('button',{name:'Connect',exact:true}).click(); await page.clock.runFor(1300);
}
async function enable(page:Page) {
  await page.locator('#teacher-clearance').check(); await page.getByRole('button',{name:'Enable teacher controls'}).click();
}
const writes = (page:Page) => page.evaluate(() => (window as unknown as {teacherRobot:{writes:{at:number;bytes:number[]}[]}}).teacherRobot.writes);

test('all twelve reusable jog controls work from live readings with no queued clicks or reload arming',async({page})=>{
  const errors:string[]=[],requests:string[]=[]; page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
  await robot(page); await expect(page.locator('[data-app-version]')).toHaveText('Version 0.7.0-dev.12');
  await expect(page.locator('#teacher-joints button')).toHaveCount(12); expect(await writes(page)).toEqual([]);
  await connect(page); await expect(page.getByRole('button',{name:'Servo 1 plus 20'})).toBeDisabled(); await enable(page);
  for(let servo=1;servo<=6;servo++)for(const direction of ['plus','minus']) {
    const before=Number(await page.locator(`[data-servo-value="${servo}"]`).textContent()), count=(await writes(page)).length;
    const button=page.getByRole('button',{name:`Servo ${servo} ${direction} 20`}); await expect(button).toBeEnabled(); await button.click();
    await expect(page.locator('#teacher-joints button:enabled')).toHaveCount(0);
    await button.evaluate(button=>(button as HTMLButtonElement).click()); expect(await writes(page)).toHaveLength(count+1);
    const packet=(await writes(page)).at(-1)!.bytes;
    expect(packet[2]).toBe(servo); expect(packet[6]!+256*packet[7]!).toBe(before+(direction==='plus'?20:-20));
    await page.clock.runFor(500); await expect(button).toBeEnabled();
  }
  await page.setViewportSize({width:768,height:720}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:900}); await page.screenshot({path:'test-results/teacher-controls.png',fullPage:true});
  await page.getByRole('button',{name:'Disconnect',exact:true}).click(); await page.reload(); expect(await writes(page)).toEqual([]);
  await connect(page); await expect(page.getByRole('button',{name:'Servo 1 plus 20'})).toBeDisabled();
  expect(requests.every(url=>url.startsWith('http://127.0.0.1:4173/'))).toBe(true); expect(errors).toEqual([]);
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});

test('slow Home follows the displayed order, completes all joints, and never sends a large jump',async({page})=>{
  const home=[2050,2150,2100,2200,2000,1080];await robot(page,home.map(n=>n+25)); await connect(page); await enable(page);
  await page.getByRole('button',{name:'Return slowly to Home'}).click();await expect(page.getByRole('button',{name:'Servo 1 plus 20'})).toBeDisabled();
  await page.clock.runFor(30000); await expect(page.locator('#teacher-home-status')).toContainText('Complete');
  const commands=await writes(page);expect(commands).toHaveLength(18);expect([...new Set(commands.map(w=>w.bytes[2]))]).toEqual([2,3,4,5,1,6]);
  for(let i=1;i<commands.length;i++)expect(commands[i]!.at-commands[i-1]!.at).toBeGreaterThanOrEqual(1200);
  const actual=await page.locator('[data-servo-value]').allTextContents();expect(actual.map(Number).every((n,i)=>Math.abs(n-home[i]!)<=9)).toBe(true);
  await expect(page.getByRole('button',{name:'Return slowly to Home'})).toBeDisabled(); await expect(page.getByRole('button',{name:'Servo 6 minus 20'})).toBeEnabled();
  await page.getByText('Session report and earlier commissioning tools',{exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export session report'}).click();
  expect((await download).suggestedFilename()).toBe('nexarm-teacher-control-session.json');await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});

test('Stop cancels a long gripper return and permits a new Home run without reconnecting',async({page})=>{
  await robot(page,[2050,2150,2100,2200,2000,2050]);await connect(page);await enable(page);
  await expect(page.locator('#teacher-home-preview')).toContainText('97 small steps');await page.getByRole('button',{name:'Return slowly to Home'}).click();await page.clock.runFor(2600);
  await page.getByRole('button',{name:'Stop motion'}).click();const count=(await writes(page)).length;await page.clock.runFor(5000);expect(await writes(page)).toHaveLength(count);
  await expect(page.locator('#teacher-status')).toContainText('Listening');await expect(page.locator('#teacher-clearance')).not.toBeChecked();
  await enable(page);await page.getByRole('button',{name:'Return slowly to Home'}).click();await page.clock.runFor(130000);
  await expect(page.locator('#teacher-home-status')).toContainText('Complete');await expect(page.locator('[data-servo-value="6"]')).toHaveText('1085');
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});

test('manual release and holding confirmation retain the reload interlock on the simpler page',async({page})=>{
  await robot(page);await connect(page);await enable(page);await page.getByText('Manual positioning: release and restore holding',{exact:true}).click();
  await page.locator('#teacher-support').check();await page.getByRole('button',{name:'Release all servos'}).click();await page.clock.runFor(1400);
  expect((await writes(page))[0]!.bytes).toEqual([255,255,255,3,61,0,192]);await expect(page.locator('#teacher-clearance')).not.toBeChecked();
  await expect(page.locator('#teacher-enable')).toBeDisabled();await page.getByRole('button',{name:'Restore servo holding'}).click();await page.clock.runFor(1400);
  expect((await writes(page))[1]!.bytes).toEqual([255,255,255,3,61,1,191]);await page.locator('#teacher-held').check();await page.getByRole('button',{name:'Confirm holding restored'}).click();
  await page.clock.runFor(1400);await enable(page);await page.locator('#teacher-support').check();await page.getByRole('button',{name:'Release all servos'}).click();await page.clock.runFor(1400);
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.reload();await expect(page.locator('#teacher-manual-details')).toHaveAttribute('open','');
  await connect(page);await expect(page.locator('#teacher-enable')).toBeDisabled();await page.locator('#teacher-held').check();await page.getByRole('button',{name:'Confirm holding restored'}).click();
  expect(await writes(page)).toEqual([]);await page.clock.runFor(1400);await enable(page);await expect(page.getByRole('button',{name:'Servo 1 minus 20'})).toBeEnabled();
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});

test('stale feedback disarms and fresh readings allow explicit recovery on the same connection',async({page})=>{
  await robot(page);await connect(page);await enable(page);
  await page.evaluate(()=>(window as unknown as {teacherRobot:{paused:boolean}}).teacherRobot.paused=true);await page.clock.runFor(700);
  await expect(page.locator('#teacher-status')).toContainText('Controls off');await expect(page.locator('#teacher-clearance')).not.toBeChecked();
  await expect(page.getByRole('button',{name:'Servo 2 plus 20'})).toBeDisabled();expect(await writes(page)).toEqual([]);
  await page.evaluate(()=>(window as unknown as {teacherRobot:{paused:boolean}}).teacherRobot.paused=false);await page.clock.runFor(1400);await enable(page);
  await page.getByRole('button',{name:'Servo 2 plus 20'}).click();await page.clock.runFor(1700);expect(await writes(page)).toHaveLength(1);
  await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});
