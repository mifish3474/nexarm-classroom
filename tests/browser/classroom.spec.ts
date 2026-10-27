import {expect,test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function station(page:Page){
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
 await page.addInitScript(()=>{
  const home=[2050,2150,2100,2200,2000,1080],positions=[...home],targets=[...home],speeds=Array(6).fill(600);
  const state={positions,targets,writes:[] as number[][],requests:0,paused:false,weak:false,reportedPose:[39,-1,399,184,8,-87],holding:true,j3Offset:0,ikTargets:null as number[]|null};Object.assign(window,{classroomRobot:state});
  Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{state.requests++;let timer:ReturnType<typeof setInterval>,reader:ReadableStreamDefaultController<Uint8Array>;return {
   open:async()=>{},close:async()=>clearInterval(timer),readable:new ReadableStream<Uint8Array>({start(controller){reader=controller;timer=setInterval(()=>{
    if(state.paused)return;if(state.holding)positions.forEach((value,i)=>{const delta=targets[i]!-(i===2?state.j3Offset:0)-value;positions[i]=value+Math.sign(delta)*Math.min(Math.abs(delta),speeds[i]*.1);});
    const body=[255,26,11,...state.reportedPose.flatMap(value=>[value&255,(value>>8)&255]),...positions.flatMap(value=>[value&255,value>>8])];controller.enqueue(Uint8Array.from([255,255,...body,(~(state.weak?body.slice(0,3):body).reduce((a,b)=>a+b,0))&255]));
   },100);},cancel(){clearInterval(timer);}}),writable:new WritableStream<Uint8Array>({write(bytes){state.writes.push([...bytes]);for(let offset=0;offset<bytes.length;){const b=bytes.slice(offset,offset+bytes[offset+3]!+4);if(b[2]===255&&b[4]===7&&state.ikTargets){const body=[255,26,7,...b.slice(7,13),...b.slice(5,7),...b.slice(13,17),...state.ikTargets.flatMap(n=>[n&255,n>>8])];setTimeout(()=>reader.enqueue(Uint8Array.from([255,255,...body,(~body.reduce((a,b)=>a+b,0))&255])),20);}else if(b[2]===255&&b[4]===61){state.holding=b[5]===1;if(state.holding)positions.forEach((value,i)=>targets[i]=value);}else if(b[2]!>=1&&b[2]!<=6&&b[5]===41){targets[b[2]!-1]=b[7]!+256*b[8]!;speeds[b[2]!-1]=b[11]!+256*b[12]!;}offset+=b.length;}}})
  };}}});
 });
 await page.goto('/');
 await page.locator('#robot-readings-details').evaluate(node=>(node as HTMLDetailsElement).open=true);
}
const writes=(page:Page)=>page.evaluate(()=>(window as unknown as {classroomRobot:{writes:number[][]}}).classroomRobot.writes);
async function ready(page:Page){
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();await expect(page.locator('#robot-enable, #robot-clearance, #teach-held, #teach-confirm, #teach-support')).toHaveCount(0);
}
async function connect(page:Page){
 await page.getByRole('button',{name:'Connect robot',exact:true}).click();await page.clock.runFor(1200);
}
async function seedPositions(page:Page){
 await page.addInitScript(()=>localStorage.setItem('nexarm.named-positions.v1',JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:[
   {id:'pickup',name:'Pickup',positions:[2130,2230,2180,2280,2080,1160],capturedAt:'2026-10-23T00:00:00Z'},
   {id:'home',name:'Home',positions:[2050,2150,2100,2200,2000,1080],capturedAt:'2026-10-23T00:00:00Z'}
 ]})));
}

test('Run from a different pose returns Home before a wait block, and Stop cancels the next return',async({page})=>{
 await station(page);await connect(page);await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.getByRole('button',{name:'Add wait block',exact:true}).click();
 const moveAway=()=>page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{positions:number[];targets:number[]}}).classroomRobot;s.positions.forEach((_,i)=>{s.positions[i]=[2050,2150,2100,2200,2000,1080][i]!+200;s.targets[i]=s.positions[i]!;});});
 await moveAway();await page.clock.runFor(300);expect(await writes(page)).toHaveLength(0);
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#run-status')).toContainText('Returning to Home');
 await page.clock.runFor(1200);const commands=await writes(page);expect(commands).toHaveLength(6);expect(commands.map(b=>b[7]!+256*b[8]!)).toEqual([2050,2150,2100,2200,2000,1080]);await expect(page.locator('#run-status')).toContainText('Waiting');
 await page.clock.runFor(1200);await expect(page.locator('#state')).toHaveText('Completed');
 await moveAway();await page.clock.runFor(300);await page.getByRole('button',{name:'Run program',exact:true}).click();await page.clock.runFor(100);await page.getByRole('button',{name:'Stop',exact:true}).click();const count=(await writes(page)).length;
 await page.clock.runFor(4000);expect(await writes(page)).toHaveLength(count);await expect(page.locator('#state')).toHaveText('Stopped');await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('an unsuccessful Home return faults without starting block 1 or retrying',async({page})=>{
 await station(page);await connect(page);await page.getByRole('button',{name:'Load short practice program',exact:true}).click();
 await page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{positions:number[];holding:boolean}}).classroomRobot;s.holding=false;s.positions[2]=1880;});await page.clock.runFor(300);
 await page.getByRole('button',{name:'Run program',exact:true}).click();await page.clock.runFor(4000);await expect(page.locator('#state')).toHaveText('Fault');await expect(page.locator('#run-status')).toContainText('Home was not reached');
 const commands=await writes(page);expect(commands).toHaveLength(6);expect(commands.map(b=>b[7]!+256*b[8]!)).toEqual([2050,2150,2100,2200,2000,1080]);await page.clock.runFor(1000);expect(await writes(page)).toHaveLength(6);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('program save/load restores loops and XYZ values without movement and malformed files preserve the editor',async({page})=>{
 await station(page);await page.getByText('Program steps and keyboard editing',{exact:true}).click();
 await page.getByRole('spinbutton',{name:/repeat count/}).fill('3');await page.getByRole('spinbutton',{name:/repeat count/}).dispatchEvent('change');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save program',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe('nexarm-program.json');
 const text=await readFile((await file.path())!,'utf8');expect(JSON.parse(text).instructions.some((node:{kind:string;count:number})=>node.kind==='repeat'&&node.count===3)).toBe(true);
 await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.locator('#program-file').setInputFiles({name:'sample.json',mimeType:'application/json',buffer:Buffer.from(text)});
 await expect(page.locator('#program-file-status')).toContainText('loaded for review');await expect(page.getByRole('spinbutton',{name:/repeat count/})).toHaveValue('3');expect(await writes(page)).toHaveLength(0);
 await page.locator('#program-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad json')});await expect(page.locator('#program-file-status')).toContainText('valid NexArm');await expect(page.getByRole('spinbutton',{name:/repeat count/})).toHaveValue('3');
 await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.getByRole('button',{name:'Add XYZ/P/R/C block',exact:true}).click();
 const z=page.getByRole('spinbutton',{name:'Block 2 · Z (mm)',exact:true});await z.fill('-71');await z.dispatchEvent('change');
 const xyzDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Save program',exact:true}).click();const xyzText=await readFile((await (await xyzDownload).path())!,'utf8');
 await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.locator('#program-file').setInputFiles({name:'xyz.json',mimeType:'application/json',buffer:Buffer.from(xyzText)});await expect(page.locator('#program-file-status')).toContainText('loaded for review');await expect(z).toHaveValue('-71');
 await connect(page);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();expect(await writes(page)).toHaveLength(0);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('a saved program carries its pose snapshots across reload without overwriting the position library or auto-running',async({page})=>{
 await seedPositions(page);await station(page);await page.getByRole('button',{name:'New empty program',exact:true}).click();
 await page.locator('#program-position').selectOption('pickup');await page.getByRole('button',{name:'Add position block',exact:true}).click();await page.getByRole('button',{name:'Add wait block',exact:true}).click();await page.locator('#program-position').selectOption('home');await page.getByRole('button',{name:'Add position block',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save program',exact:true}).click();const text=await readFile((await (await download).path())!,'utf8');
 await page.reload();expect(await writes(page)).toHaveLength(0);
 // A changed browser library must not change the program-file pose snapshots.
 await page.getByText('Release, record, and restore',{exact:true}).click();await page.getByRole('button',{name:'Clear saved positions',exact:true}).click();const library=await page.evaluate(()=>localStorage.getItem('nexarm.named-positions.v1'));
 await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.locator('#program-file').setInputFiles({name:'positions.json',mimeType:'application/json',buffer:Buffer.from(text)});await expect(page.locator('#program-file-status')).toContainText('loaded for review');
 expect(await page.evaluate(()=>localStorage.getItem('nexarm.named-positions.v1'))).toBe(library);expect(await writes(page)).toHaveLength(0);
 await connect(page);expect(await writes(page)).toHaveLength(0);await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(3600);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('read-only XYZ/P/R/C matches passive reports, labels stale/disconnected data and clears old values on reconnect',async({page})=>{
 await station(page);const panel=page.locator('#robot-xyz');await expect(panel).toBeVisible();await expect(panel.locator('[data-reported-axis]')).toHaveText(['—','—','—','—','—','—']);
 await page.getByRole('button',{name:'Connect robot',exact:true}).click();await page.clock.runFor(1200);
 await expect(panel.locator('[data-reported-axis]')).toHaveText(['39','-1','399','18.4','8','-87']);await expect(panel.locator('[data-coordinate-status]')).toContainText('Live report');
 await expect(panel).toContainText('reference point still need verification');await expect(panel.locator('input, button, canvas, svg')).toHaveCount(0);expect(await writes(page)).toEqual([]);
 await page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{reportedPose:number[]}}).classroomRobot;s.reportedPose=[-120,45,300,-125,-90,25];});await page.clock.runFor(100);
 await expect(panel.locator('[data-reported-axis]')).toHaveText(['-120','45','300','-12.5','-90','25']);
 await page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{weak:boolean;reportedPose:number[]}}).classroomRobot;s.weak=true;s.reportedPose[0]=666;});await page.clock.runFor(700);
 await expect(panel.locator('[data-coordinate-status]')).toContainText('stale');await expect(panel.locator('[data-reported-axis="x"]')).toHaveText('-120');
 await page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{weak:boolean;reportedPose:number[]}}).classroomRobot;s.weak=false;s.reportedPose[0]=321;});await page.clock.runFor(100);
 await expect(panel.locator('[data-coordinate-status]')).toContainText('Live report');await expect(panel.locator('[data-reported-axis="x"]')).toHaveText('321');
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();await expect(panel.locator('[data-coordinate-status]')).toContainText('Disconnected · last report');expect(await writes(page)).toEqual([]);
 await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=true);await page.getByRole('button',{name:'Connect robot',exact:true}).click();await page.clock.runFor(100);
 await expect(panel.locator('[data-coordinate-status]')).toContainText('Waiting for the first valid');await expect(panel.locator('[data-reported-axis]')).toHaveText(['—','—','—','—','—','—']);
 await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=false);await page.clock.runFor(350);await expect(panel.locator('[data-reported-axis="x"]')).toHaveText('321');
 await page.setViewportSize({width:390,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await writes(page)).toEqual([]);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();expect(await writes(page)).toEqual([]);
});

test('XYZ/P/R/C editing and unsupported calculation stop without program movement',async({page})=>{
 await station(page);await connect(page);await page.getByRole('button',{name:'New empty program',exact:true}).click();
 await page.evaluate(()=>(window as unknown as {classroomRobot:{reportedPose:number[]}}).classroomRobot.reportedPose[2]=-71);await page.clock.runFor(100);
 await page.getByRole('button',{name:'Add XYZ/P/R/C block',exact:true}).click();await page.getByText('Program steps and keyboard editing',{exact:true}).click();
 const fields=[['X (mm)','39'],['Y (mm)','-1'],['Z (mm)','-71'],['P · pitch (degrees)','18.4'],['R · roll (degrees)','8'],['C · claw (degrees)','-87']] as const;
 for(const [label,value] of fields)await expect(page.getByRole('spinbutton',{name:`Block 2 · ${label}`,exact:true})).toHaveValue(value);
 await expect(page.getByRole('spinbutton',{name:'Block 2 · Z (mm)',exact:true})).toHaveAttribute('min','-570');
 for(const [label,value] of [['X (mm)','50'],['Y (mm)','-30'],['Z (mm)','-71'],['P · pitch (degrees)','-12.5'],['R · roll (degrees)','-15'],['C · claw (degrees)','-60'],['coordinate duration seconds','2.5']]){
   const input=page.getByRole('spinbutton',{name:`Block 2 · ${label}`,exact:true});await input.fill(value!);await input.dispatchEvent('change');
 }
 await page.getByRole('button',{name:'Add wait block',exact:true}).click();await page.getByRole('button',{name:'Add XYZ/P/R/C block',exact:true}).click();expect(await writes(page)).toHaveLength(0);
 await page.clock.runFor(100);const run=page.getByRole('button',{name:'Run program',exact:true});await expect(run).toBeEnabled();await expect(page.locator('#robot-readiness')).toContainText('check all XYZ');
 await run.click();await page.clock.runFor(2500);expect(await writes(page)).toHaveLength(1);expect((await writes(page))[0]![4]).toBe(7);await expect(page.locator('#state')).toHaveText('Fault');await expect(page.locator('#run-status')).toContainText('Coordinate block 1');await expect(page.locator('#run-status')).toContainText('No calculation-only reply received');
 await expect(page.getByRole('spinbutton',{name:'Block 2 · Z (mm)',exact:true})).toHaveValue('-71');await expect(page.locator('#robot-xyz [data-coordinate-status]')).toContainText('Live report');
 await page.clock.runFor(500);await page.getByRole('button',{name:'Load short practice program',exact:true}).click();await expect(run).toBeEnabled();await run.click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(3);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('XYZ solutions run as six joint targets and out-of-range solutions send no joint commands',async({page})=>{
 await station(page);await connect(page);await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.getByRole('button',{name:'Add XYZ/P/R/C block',exact:true}).click();
 await page.getByText('Program steps and keyboard editing',{exact:true}).click();
 const x=page.getByRole('spinbutton',{name:'Block 2 · X (mm)',exact:true});await x.fill('257');await x.dispatchEvent('change');await expect(x).toHaveValue('257');
 await page.evaluate(()=>(window as unknown as {classroomRobot:{ikTargets:number[]}}).classroomRobot.ikTargets=[2090,2190,2140,2240,2040,1120]);
 await page.getByRole('button',{name:'Run program',exact:true}).click();await page.clock.runFor(3600);await expect(page.locator('#state')).toHaveText('Completed');
 const first=await writes(page);expect(first).toHaveLength(7);expect(first[0]![4]).toBe(7);expect(first[0]!.slice(7,9)).toEqual([1,1]);expect(first.slice(1).map(b=>b[2])).toEqual([1,2,3,4,5,6]);expect(first.some(b=>b[2]===255&&b[4]===8)).toBe(false);
 await page.evaluate(()=>(window as unknown as {classroomRobot:{ikTargets:number[]}}).classroomRobot.ikTargets=[2090,2190,2901,2240,2040,1120]);
 await page.getByRole('button',{name:'Run program',exact:true}).click();await page.clock.runFor(700);await expect(page.locator('#state')).toHaveText('Fault');await expect(page.locator('#run-status')).toContainText('J3 target 2901');expect(await writes(page)).toHaveLength(8);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('station view exposes no simulator and coordinate editing never opens USB or starts motion',async({page})=>{
 await station(page);await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.getByRole('button',{name:'Add XYZ/P/R/C block',exact:true}).click();
 await page.clock.runFor(100);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();await expect(page.locator('#execution-mode, #arm-illustration, #reset')).toHaveCount(0);
 expect(await writes(page)).toHaveLength(0);expect(await page.evaluate(()=>(window as unknown as {classroomRobot:{requests:number}}).classroomRobot.requests)).toBe(0);await expect(page.locator('#state')).not.toHaveText('Running');
});

test('after Home readiness, a small J3 pose target completes on its editable duration without arrival',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nexarm.named-positions.v1',JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:[{id:'near',name:'Near',positions:[2050,2150,2127,2200,2000,1080],capturedAt:'2026-10-23T00:00:00Z'}]})));
 await station(page);await connect(page);await page.evaluate(()=>(window as unknown as {classroomRobot:{holding:boolean}}).classroomRobot.holding=false);await page.clock.runFor(300);
 await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.getByRole('button',{name:'Add position block',exact:true}).click();await page.getByText('Program steps and keyboard editing',{exact:true}).click();
 await page.getByRole('spinbutton',{name:/pose duration seconds/}).fill('2');await page.getByRole('spinbutton',{name:/pose duration seconds/}).dispatchEvent('change');
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(1500);await expect(page.locator('#state')).toHaveText('Running');expect(await writes(page)).toHaveLength(6);
 const command=(await writes(page))[2]!;expect(command[2]).toBe(3);expect(command[7]!+256*command[8]!).toBe(2127);
 await page.clock.runFor(700);await expect(page.locator('#state')).toHaveText('Completed');await expect(page.locator('#run-status')).toContainText('timing complete');await expect(page.locator('.joint-card strong').nth(2)).toHaveText('2100');expect(await writes(page)).toHaveLength(6);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('a measured 32-unit J3 offset advances through Blockly by frame time without retries',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nexarm.named-positions.v1',JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:[
   {id:'reach',name:'Reach',positions:[2050,2150,2838,2200,2000,1080],capturedAt:'2026-10-23T00:00:00Z'},
   {id:'home',name:'Home',positions:[2050,2150,2100,2200,2000,1080],capturedAt:'2026-10-23T00:00:00Z'}]})));
 await station(page);await connect(page);await page.getByRole('button',{name:'New empty program',exact:true}).click();
 await page.locator('#program-position').selectOption('reach');await page.getByRole('button',{name:'Add position block',exact:true}).click();await page.getByRole('button',{name:'Add wait block',exact:true}).click();await page.locator('#program-position').selectOption('home');await page.getByRole('button',{name:'Add position block',exact:true}).click();
 await page.evaluate(()=>(window as unknown as {classroomRobot:{j3Offset:number}}).classroomRobot.j3Offset=32);
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2000);
 await expect(page.locator('.joint-card strong').nth(2)).toHaveText('2806');await expect(page.locator('#run-status')).toContainText('Waiting');expect(await writes(page)).toHaveLength(6);
 const first=(await writes(page))[2]!;expect(first[2]).toBe(3);expect(first[7]!+256*first[8]!).toBe(2838);
 await page.clock.runFor(3000);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);await expect(page.locator('.joint-card strong').nth(2)).toHaveText('2068');
 await page.clock.runFor(3000);expect(await writes(page)).toHaveLength(12);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('endpoint-path deviations do not interrupt timed pose playback and Stop remains available',async({page})=>{
 await seedPositions(page);await station(page);await connect(page);
 await page.getByRole('button',{name:'New empty program',exact:true}).click();
 for(const position of ['pickup','home']){await page.locator('#program-position').selectOption(position);await page.getByRole('button',{name:'Add position block',exact:true}).click();}
 // Freeze physical tracking and inject in-range readings beyond the current
 // endpoint interval, as can happen during overlapping frames or a reversal.
 await page.evaluate(()=>(window as unknown as {classroomRobot:{holding:boolean}}).classroomRobot.holding=false);
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(100);expect(await writes(page)).toHaveLength(6);
 await page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot;s.positions.forEach((value,i)=>s.positions[i]=value+240);});
 await page.clock.runFor(100);await expect(page.locator('#state')).toHaveText('Running');await expect(page.locator('#robot-status')).not.toContainText('outside its commanded path');
 await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);await ready(page);
 await expect(page.locator('.joint-card strong').first()).toHaveText('2290');
 await page.getByRole('button',{name:'Stop',exact:true}).click();expect(await writes(page)).toHaveLength(13);expect((await writes(page)).at(-1)).toHaveLength(84);
 await page.clock.runFor(1000);expect(await writes(page)).toHaveLength(13);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('live recording boxes show ranges beside the name and block every out-of-range or stale capture',async({page})=>{
 await station(page);await connect(page);await page.getByText('Release, record, and restore',{exact:true}).click();await page.getByRole('button',{name:'Release servos for hand positioning'}).click();await page.clock.runFor(600);
 const name=page.getByRole('textbox',{name:'Position name'}),record=page.getByRole('button',{name:'Record current position',exact:true});await name.fill('Pickup');
 await expect(page.locator('#teach-readings .teach-reading')).toHaveCount(6);await expect(record).toBeEnabled();
 const nameBox=await name.boundingBox(),readingsBox=await page.locator('#teach-readings').boundingBox();expect(readingsBox!.x).toBeGreaterThan(nameBox!.x);
 const limits=[[900,3000],[525,2600],[2000,2900],[1250,3000],[1024,3072],[1024,2731]],home=[2050,2150,2100,2200,2000,1080];
 for(let i=0;i<6;i++){
   const box=page.locator(`.teach-reading[data-joint="${i+1}"]`),input=page.getByRole('textbox',{name:`J${i+1} reported position`,exact:true});await expect(box).toContainText(`Valid: ${limits[i]![0]}–${limits[i]![1]}`);
   for(const value of [limits[i]![0]!-1,limits[i]![1]!+1]){
     const pose=[...home];pose[i]=value;await page.evaluate(pose=>(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot.positions.splice(0,6,...pose),pose);await page.clock.runFor(100);
     await expect(input).toHaveValue(String(value));await expect(input).toHaveAttribute('readonly','');await expect(input).toHaveAttribute('aria-invalid','true');await expect(box).toHaveCSS('border-top-color','rgb(180, 35, 24)');await expect(box).toContainText('Out of range');await expect(record).toBeDisabled();await expect(page.locator('#pose-capture-status')).toContainText(`J${i+1}`);
   }
   await page.evaluate(pose=>(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot.positions.splice(0,6,...pose),home);await page.clock.runFor(100);await expect(input).toHaveAttribute('aria-invalid','false');await expect(record).toBeEnabled();
 }
 expect(await writes(page)).toHaveLength(1);expect(await page.evaluate(()=>localStorage.getItem('nexarm.named-positions.v1'))).toBeNull();
 await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=true);await page.clock.runFor(700);await expect(record).toBeDisabled();await expect(page.locator('#pose-capture-status')).toContainText('fresh live readings');await expect(page.locator('#teach-readings')).toContainText('last reading');
 await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=false);await page.clock.runFor(100);await expect(record).toBeEnabled();await record.click();await expect(page.locator('#saved-positions')).toContainText('Pickup');expect(await writes(page)).toHaveLength(1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nexarm.named-positions.v1')!).poses[0].positions)).toEqual(home);
 await page.setViewportSize({width:390,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('invalid recorded targets are flagged and prevent the entire live program without clearing Enable',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nexarm.named-positions.v1',JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:[{id:'t2',name:'t2',positions:[1968,1335,3144,3407,2109,2397],capturedAt:'2026-10-23T00:00:00Z'}]})));
 await station(page);await connect(page);await ready(page);await page.getByText('Release, record, and restore',{exact:true}).click();
 await expect(page.locator('#saved-positions')).toContainText('J3 target 3144 is outside its operating range 2000–2900');await expect(page.locator('#saved-positions')).toContainText('J4 target 3407');
 await expect(page.getByRole('button',{name:'Move to position t2',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Load short practice program',exact:true}).click();await page.getByRole('button',{name:'Add position block',exact:true}).click();await page.getByRole('button',{name:'Run program',exact:true}).click();
 await expect(page.locator('#run-status')).toContainText('Saved position "t2": J3 target 3144');expect(await writes(page)).toHaveLength(0);await expect(page.locator('#robot-status')).toContainText('Robot enabled');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nexarm.named-positions.v1')!).poses[0].positions)).toEqual([1968,1335,3144,3407,2109,2397]);
 await page.getByRole('button',{name:'Load short practice program',exact:true}).click();await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(2);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('saved pose buttons send six targets after Connect and finish at frame time',async({page})=>{
 await seedPositions(page);await station(page);await connect(page);await page.getByText('Release, record, and restore',{exact:true}).click();
 const move=page.getByRole('button',{name:'Move to position Pickup',exact:true});await expect(move).toBeEnabled();await ready(page);await move.click();await page.clock.runFor(100);
 await expect(move).toBeDisabled();await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 expect(await writes(page)).toHaveLength(6);expect((await writes(page))[0]).toHaveLength(14);await page.clock.runFor(1200);
 await expect(page.locator('#state')).toHaveText('Complete');await expect(move).toBeEnabled();
 expect(await page.locator('.joint-card strong').allTextContents()).toEqual(['2130','2230','2180','2280','2080','1160']);
 await page.getByRole('button',{name:'Move to position Home',exact:true}).click();await page.clock.runFor(1300);await expect(page.locator('#state')).toHaveText('Complete');expect(await writes(page)).toHaveLength(12);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('Blockly chains named positions and a wait on the station robot without extra enable',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await seedPositions(page);await station(page);
 await page.getByRole('button',{name:'New empty program',exact:true}).click();await page.locator('#program-position').selectOption('pickup');await page.getByRole('button',{name:'Add position block',exact:true}).click();
 await page.getByRole('button',{name:'Add wait block',exact:true}).click();await page.locator('#program-position').selectOption('home');await page.getByRole('button',{name:'Add position block',exact:true}).click();
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();expect(await writes(page)).toHaveLength(0);
 await connect(page);await ready(page);await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(700);
 expect(await writes(page)).toHaveLength(6);await page.clock.runFor(600);await expect(page.locator('#run-status')).toContainText('Waiting');expect(await writes(page)).toHaveLength(6);
 await page.clock.runFor(2300);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);
 for(const command of await writes(page)){expect(command).toHaveLength(14);expect(command.slice(6,7)).toEqual([10]);expect(command[11]!+256*command[12]!).toBeLessThanOrEqual(600);}
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(3600);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(24);expect(errors).toEqual([]);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('a deleted position blocks compilation without sending commands',async({page})=>{
 await seedPositions(page);await station(page);await connect(page);await ready(page);await page.getByRole('button',{name:'New empty program',exact:true}).click();
 await page.locator('#program-position').selectOption('pickup');await page.getByRole('button',{name:'Add position block',exact:true}).click();await page.getByText('Release, record, and restore',{exact:true}).click();await page.getByRole('button',{name:'Delete position Pickup',exact:true}).click();
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#run-status')).toContainText('saved position is missing');expect(await writes(page)).toHaveLength(0);
 await page.getByText('Program steps and keyboard editing',{exact:true}).click();await page.locator('#keyboard-fields select').selectOption('home');await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(1200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(6);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('students edit and rerun Blockly programs without another enable or teacher approval',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await station(page);expect(await page.evaluate(()=>(window as unknown as {classroomRobot:{requests:number}}).classroomRobot.requests)).toBe(0);
 await connect(page);expect(await writes(page)).toEqual([]);await ready(page);expect(await writes(page)).toEqual([]);
 await page.getByRole('button',{name:'Load short practice program'}).click();await expect(page.locator('#robot-status')).toContainText('Robot enabled');
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);
 await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(2);
 await page.getByText('Program steps and keyboard editing',{exact:true}).click();const target=page.locator('#keyboard-fields input[max="4095"]').first();await target.fill('2140');await target.dispatchEvent('change');
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);
 await expect(page.locator('#state')).toHaveText('Completed');const commands=await writes(page);expect(commands).toHaveLength(4);expect(commands[2]![7]!+256*commands[2]![8]!).toBe(2140);
 await expect(page.locator('#robot-status')).toContainText('Robot enabled');expect(errors).toEqual([]);expect(requests.every(url=>url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('Stop cancels subsequent blocks and students can recover',async({page})=>{
 await station(page);await connect(page);await ready(page);await page.getByRole('button',{name:'Load short practice program'}).click();
 await page.getByRole('button',{name:'Load short practice program'}).click();await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');
 await page.clock.runFor(100);await page.getByRole('button',{name:'Stop',exact:true}).click();const count=(await writes(page)).length;await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(count);
 await expect(page.locator('#state')).toHaveText('Stopped');await ready(page);await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
test('Stop stays available after a program fault and sends a hold without resuming later blocks',async({page})=>{
 await station(page);await connect(page);await ready(page);await page.getByRole('button',{name:'Load short practice program'}).click();
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');
 await page.evaluate(()=>(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot.positions[0]=3900);await page.clock.runFor(100);
 await expect(page.locator('#state')).toHaveText('Fault');await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeEnabled();
 const beforeExport=(await writes(page)).length,download=page.waitForEvent('download');await page.getByRole('button',{name:'Export robot diagnostics'}).click();
 expect((await download).suggestedFilename()).toBe('nexarm-robot-diagnostics.json');expect(await writes(page)).toHaveLength(beforeExport);
 await page.getByRole('button',{name:'Stop',exact:true}).click();const commands=await writes(page);expect(commands).toHaveLength(2);expect(commands[1]!.slice(11,13)).toEqual([100,0]);
 await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(2);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('stale feedback explains disabled Run and fresh feedback restores it without moving',async({page})=>{
 await station(page);await connect(page);await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=true);await page.clock.runFor(700);
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();await expect(page.locator('#robot-readiness')).toContainText('Waiting for current position feedback');
 await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=false);await page.clock.runFor(100);
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();expect(await writes(page)).toEqual([]);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('unfinished release requires Restore but no confirmation or Enable',async({page})=>{
 await station(page);await page.evaluate(()=>localStorage.setItem('nexarm.commissioning.manual-positioning.v1',JSON.stringify({requiresHoldingVerification:true,events:[]})));await connect(page);
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 await expect(page.locator('#robot-readiness')).toContainText('Restore servo holding');
 expect(await writes(page)).toEqual([]);await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('disconnect cancels a live program and reload never reconnects or resumes it',async({page})=>{
 await station(page);await connect(page);await ready(page);await page.getByRole('button',{name:'Load short practice program'}).click();
 await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();const count=(await writes(page)).length;await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(count);
 await page.reload();await expect(page.locator('#mode-label')).toHaveText('Station robot');expect(await writes(page)).toEqual([]);
 expect(await page.evaluate(()=>(window as unknown as {classroomRobot:{requests:number}}).classroomRobot.requests)).toBe(0);
});

test('obsolete station settings do not block Run or expose editable limits',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nexarm.classroom-profile.v1','invalid obsolete setup'));
 await station(page);await connect(page);await ready(page);
 await expect(page.locator('#station-setup')).toHaveCount(0);await expect(page.locator('#station-limits')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Save station setup'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Load short practice program'}).click();await page.getByRole('button',{name:'Run program',exact:true}).click();await expect(page.locator('#state')).toHaveText('Running');
 await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(2);
 expect(await page.evaluate(()=>localStorage.getItem('nexarm.classroom-profile.v1'))).toBe('invalid obsolete setup');
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});

test('release, hand-position, name and record, then restore holding without a record movement',async({page})=>{
 await station(page);await connect(page);await page.getByText('Release, record, and restore',{exact:true}).click();await expect(page.getByRole('button',{name:'Release servos for hand positioning'})).toBeEnabled();
 await page.getByRole('button',{name:'Release servos for hand positioning'}).click();await page.clock.runFor(600);
 expect((await writes(page))[0]).toEqual([255,255,255,3,61,0,192]);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 const pose=[2070,2160,2080,2190,2010,1100];await page.evaluate(pose=>(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot.positions.splice(0,6,...pose),pose);await page.clock.runFor(100);
 await page.getByRole('textbox',{name:'Position name'}).fill('Pickup');await page.getByRole('button',{name:'Record current position',exact:true}).click();
 await expect(page.locator('#saved-positions')).toContainText('Pickup');await expect(page.locator('#saved-positions')).toContainText('S2: 2160');expect(await writes(page)).toHaveLength(1);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('nexarm.named-positions.v1')!));expect(stored.poses[0].positions).toEqual(pose);
 await page.getByRole('button',{name:'Restore servo holding',exact:true}).click();await page.clock.runFor(600);expect((await writes(page))[1]).toEqual([255,255,255,3,61,1,191]);
 expect(await writes(page)).toHaveLength(2);
 await ready(page);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export saved positions'}).click();expect((await download).suggestedFilename()).toBe('nexarm-named-positions.json');expect(await writes(page)).toHaveLength(2);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();await page.reload();await expect(page.locator('#saved-positions')).toContainText('Pickup');
 await page.getByText('Release, record, and restore',{exact:true}).click();await page.getByRole('button',{name:'Delete position Pickup',exact:true}).click();await expect(page.locator('#saved-positions li')).toHaveCount(0);
});

test('stale capture is blocked and interrupted teaching survives reload without automatic restore',async({page})=>{
 await station(page);await connect(page);await page.getByText('Release, record, and restore',{exact:true}).click();await page.getByRole('button',{name:'Release servos for hand positioning'}).click();await page.clock.runFor(600);
 await page.getByRole('textbox',{name:'Position name'}).fill('Dropoff');await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=true);await page.clock.runFor(700);
 await expect(page.getByRole('button',{name:'Record current position',exact:true})).toBeDisabled();expect(await writes(page)).toHaveLength(1);
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();await page.reload();await connect(page);expect(await writes(page)).toEqual([]);
 await expect(page.locator('#teach-status')).toContainText('Recovery required');await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Clear saved positions'}).click();await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Disconnect robot',exact:true}).click();
});
