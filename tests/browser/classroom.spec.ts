import {expect,test} from '@playwright/test';
import type {Page} from '@playwright/test';

async function station(page:Page,configured=true){
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
 await page.addInitScript(configured=>{
  const home=[2050,2150,2100,2200,2000,1080],positions=[...home],targets=[...home];let speed=600;
  const state={positions,writes:[] as number[][],requests:0,paused:false};Object.assign(window,{classroomRobot:state});
  if(configured&&!localStorage.getItem('nexarm.classroom-profile.v1'))localStorage.setItem('nexarm.classroom-profile.v1',JSON.stringify({schemaVersion:1,limits:home.map(value=>({min:value-300,max:value+300})),speed:600,acceleration:10}));
  Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{state.requests++;let timer:ReturnType<typeof setInterval>;return {
   open:async()=>{},close:async()=>clearInterval(timer),readable:new ReadableStream<Uint8Array>({start(controller){timer=setInterval(()=>{
    if(state.paused)return;positions.forEach((value,i)=>{const delta=targets[i]!-value;positions[i]=value+Math.sign(delta)*Math.min(Math.abs(delta),speed*.1);});
    const body=[255,26,11,...Array(12).fill(0),...positions.flatMap(value=>[value&255,value>>8])];controller.enqueue(Uint8Array.from([255,255,...body,(~body.reduce((a,b)=>a+b,0))&255]));
   },100);},cancel(){clearInterval(timer);}}),writable:new WritableStream<Uint8Array>({write(bytes){state.writes.push([...bytes]);for(let offset=0;offset<bytes.length;offset+=14){const b=bytes.slice(offset,offset+14);targets[b[2]!-1]=b[7]!+256*b[8]!;speed=b[11]!+256*b[12]!;}}})
  };}}});
 },configured);
 await page.goto('/');
}
const writes=(page:Page)=>page.evaluate(()=>(window as unknown as {classroomRobot:{writes:number[][]}}).classroomRobot.writes);
async function enable(page:Page){
 await page.locator('#robot-clearance').check();await page.getByRole('button',{name:'Enable robot',exact:true}).click();
}
async function connect(page:Page){
 await page.locator('#execution-mode').selectOption('robot');await page.getByRole('button',{name:'Connect robot',exact:true}).click();await page.clock.runFor(1200);
}
test('students edit and rerun Blockly programs without another enable or teacher approval',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await station(page);expect(await page.evaluate(()=>(window as unknown as {classroomRobot:{requests:number}}).classroomRobot.requests)).toBe(0);
 await connect(page);expect(await writes(page)).toEqual([]);await enable(page);expect(await writes(page)).toEqual([]);
 await page.getByRole('button',{name:'Load short practice program'}).click();await expect(page.locator('#robot-status')).toContainText('Robot enabled');
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);
 await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(2);
 await page.getByText('Program steps and keyboard editing',{exact:true}).click();const target=page.locator('#keyboard-fields input[max="4095"]').first();await target.fill('2140');await target.dispatchEvent('change');
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);
 await expect(page.locator('#state')).toHaveText('Completed');const commands=await writes(page);expect(commands).toHaveLength(4);expect(commands[2]![7]!+256*commands[2]![8]!).toBe(2140);
 await expect(page.locator('#robot-status')).toContainText('Robot enabled');expect(errors).toEqual([]);expect(requests.every(url=>url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('out-of-range programs write nothing; Stop cancels subsequent blocks and students can recover',async({page})=>{
 await station(page);await connect(page);await enable(page);await page.getByRole('button',{name:'Load short practice program'}).click();
 await page.getByText('Program steps and keyboard editing',{exact:true}).click();let target=page.locator('#keyboard-fields input[max="4095"]').first();await target.fill('4095');await target.dispatchEvent('change');
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#run-status')).toContainText('outside the station range');expect(await writes(page)).toEqual([]);
 await page.getByRole('button',{name:'Load short practice program'}).click();await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');
 await page.clock.runFor(100);await page.getByRole('button',{name:'Stop',exact:true}).click();const count=(await writes(page)).length;await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(count);
 await expect(page.locator('#state')).toHaveText('Stopped');await enable(page);await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('one station setup persists without arming and can be cleared; mode switching cancels live execution',async({page})=>{
 await station(page,false);await connect(page);await expect(page.getByRole('button',{name:'Enable robot',exact:true})).toBeDisabled();
 await page.getByText('Station setup: movement limits',{exact:true}).click();const home=[2050,2150,2100,2200,2000,1080];
 for(let i=0;i<6;i++){await page.getByRole('spinbutton',{name:`S${i+1} station minimum`}).fill(String(home[i]!-300));await page.getByRole('spinbutton',{name:`S${i+1} station maximum`}).fill(String(home[i]!+300));}
 await page.getByRole('button',{name:'Save station setup'}).click();await page.clock.runFor(600);await expect(page.locator('#station-status')).toContainText('saved');expect(await writes(page)).toEqual([]);
 await enable(page);await page.getByRole('button',{name:'Load short practice program'}).click();await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');
 await page.locator('#execution-mode').selectOption('simulation');const count=(await writes(page)).length;await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(count);await expect(page.locator('#mode-label')).toHaveText('Learn / Simulate');
 await page.reload();await page.locator('#execution-mode').selectOption('robot');await expect(page.locator('#station-status')).toContainText('loaded');await expect(page.locator('#robot-status')).toHaveText('Disconnected.');
 await page.getByText('Station setup: movement limits',{exact:true}).click();await page.getByRole('button',{name:'Clear station setup'}).click();expect(await page.evaluate(()=>localStorage.getItem('nexarm.classroom-profile.v1'))).toBeNull();
});

test('Stop stays available after a program fault and sends a hold without resuming later blocks',async({page})=>{
 await station(page);await connect(page);await enable(page);await page.getByRole('button',{name:'Load short practice program'}).click();
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');
 await page.evaluate(()=>(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot.positions[0]=3900);await page.clock.runFor(100);
 await expect(page.locator('#state')).toHaveText('Fault');await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Stop',exact:true}).click();const commands=await writes(page);expect(commands).toHaveLength(2);expect(commands[1]!.slice(11,13)).toEqual([100,0]);
 await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(2);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
