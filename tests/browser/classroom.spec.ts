import {expect,test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';


async function openDetails(page:Page,selector:string){
 const details=page.locator(selector);if(!await details.evaluate(node=>(node as HTMLDetailsElement).open))await details.locator(':scope > summary').click();
}
async function openPosition(page:Page,name:string){
 await page.getByRole('tab',{name:'Positions',exact:true}).click();
 const row=page.locator('#saved-positions li').filter({has:page.locator('strong',{hasText:name})});
 const details=row.locator('.saved-position-details');if(!await details.evaluate(node=>(node as HTMLDetailsElement).open))await details.locator('summary').click();
}
async function clickControl(page:Page,name:string){
 if(['New empty program','Save program','Load program','Load short practice program','Reload lesson'].includes(name))await openDetails(page,'#file-menu');
 if(name.startsWith('Add ')&&name.endsWith(' block'))await openDetails(page,'#add-block-menu');
 if(['Clear saved positions','Export saved positions'].includes(name)){await page.getByRole('tab',{name:'Positions',exact:true}).click();await openDetails(page,'.position-tools');}
 if(name==='Export robot diagnostics')await page.getByRole('tab',{name:'Robot',exact:true}).click();
 if(name.startsWith('Move to position '))await openPosition(page,name.slice('Move to position '.length));
 if(name.startsWith('Delete position '))await openPosition(page,name.slice('Delete position '.length));
 await page.getByRole('button',{name,exact:true}).click();
}
async function selectPosition(page:Page,id:string){await openDetails(page,'#add-block-menu');await page.locator('#program-position').selectOption(id);}

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
 await clickControl(page,'Connect robot');await page.clock.runFor(1200);
}
async function seedPositions(page:Page){
 await page.addInitScript(()=>localStorage.setItem('nexarm.named-positions.v1',JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:[
   {id:'pickup',name:'Pickup',positions:[2130,2230,2180,2280,2080,1160],capturedAt:'2026-10-23T00:00:00Z'},
   {id:'home',name:'Home',positions:[2050,2150,2100,2200,2000,1080],capturedAt:'2026-10-23T00:00:00Z'}
 ]})));
}

test('position-library Add to code builds a program without movement and is disabled during a run',async({page})=>{
 await seedPositions(page);await station(page);await connect(page);
 await page.getByRole('button',{name:'Add position Pickup to code',exact:true}).click();
 await page.getByRole('button',{name:'Add position Home to code',exact:true}).click();expect(await writes(page)).toHaveLength(0);
 await clickControl(page,'Run program');await expect(page.getByRole('button',{name:'Add position Pickup to code',exact:true})).toBeDisabled();
 await page.clock.runFor(2500);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);
 await expect(page.getByRole('button',{name:'Add position Pickup to code',exact:true})).toBeEnabled();await clickControl(page,'Disconnect robot');
});

test('Run from a different pose returns Home before a wait block, and Stop cancels the next return',async({page})=>{
 await station(page);await connect(page);await clickControl(page,'New empty program');await clickControl(page,'Add wait block');
 const moveAway=()=>page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{positions:number[];targets:number[]}}).classroomRobot;s.positions.forEach((_,i)=>{s.positions[i]=[2050,2150,2100,2200,2000,1080][i]!+200;s.targets[i]=s.positions[i]!;});});
 await moveAway();await page.clock.runFor(300);expect(await writes(page)).toHaveLength(0);
 await clickControl(page,'Run program');await expect(page.locator('#run-status')).toContainText('Returning to Home');
 await page.clock.runFor(1200);const commands=await writes(page);expect(commands).toHaveLength(6);expect(commands.map(b=>b[7]!+256*b[8]!)).toEqual([2050,2150,2100,2200,2000,1080]);await expect(page.locator('#run-status')).toContainText('Waiting');
 await page.clock.runFor(1200);await expect(page.locator('#state')).toHaveText('Completed');
 await moveAway();await page.clock.runFor(300);await clickControl(page,'Run program');await page.clock.runFor(100);await clickControl(page,'Stop');const count=(await writes(page)).length;
 await page.clock.runFor(4000);expect(await writes(page)).toHaveLength(count);await expect(page.locator('#state')).toHaveText('Stopped');await clickControl(page,'Disconnect robot');
});

test('an unsuccessful Home return faults without starting block 1 or retrying',async({page})=>{
 await station(page);await connect(page);await clickControl(page,'Load short practice program');
 await page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{positions:number[];holding:boolean}}).classroomRobot;s.holding=false;s.positions[2]=1880;});await page.clock.runFor(300);
 await clickControl(page,'Run program');await page.clock.runFor(4000);await expect(page.locator('#state')).toHaveText('Fault');await expect(page.locator('#run-status')).toContainText('Home was not reached');
 const commands=await writes(page);expect(commands).toHaveLength(6);expect(commands.map(b=>b[7]!+256*b[8]!)).toEqual([2050,2150,2100,2200,2000,1080]);await page.clock.runFor(1000);expect(await writes(page)).toHaveLength(6);await clickControl(page,'Disconnect robot');
});

test('program save/load restores loops and joint values without movement and malformed files preserve the editor',async({page})=>{
 await station(page);await clickControl(page,'Reload lesson');await page.getByText('Program steps and keyboard editing',{exact:true}).click();
 await page.getByRole('spinbutton',{name:/repeat count/}).fill('3');await page.getByRole('spinbutton',{name:/repeat count/}).dispatchEvent('change');
 const download=page.waitForEvent('download');await clickControl(page,'Save program');const file=await download;expect(file.suggestedFilename()).toBe('nexarm-program.json');
 const text=await readFile((await file.path())!,'utf8');expect(JSON.parse(text).instructions.some((node:{kind:string;count:number})=>node.kind==='repeat'&&node.count===3)).toBe(true);
 await clickControl(page,'New empty program');await page.locator('#program-file').setInputFiles({name:'sample.json',mimeType:'application/json',buffer:Buffer.from(text)});
 await expect(page.locator('#program-file-status')).toContainText('loaded for review');await expect(page.getByRole('spinbutton',{name:/repeat count/})).toHaveValue('3');expect(await writes(page)).toHaveLength(0);
 await page.locator('#program-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad json')});await expect(page.locator('#program-file-status')).toContainText('valid NexArm');await expect(page.getByRole('spinbutton',{name:/repeat count/})).toHaveValue('3');
 await connect(page);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();expect(await writes(page)).toHaveLength(0);await clickControl(page,'Disconnect robot');
});

test('a saved program carries its pose snapshots across reload without overwriting the position library or auto-running',async({page})=>{
 await seedPositions(page);await station(page);await clickControl(page,'New empty program');
 await selectPosition(page,'pickup');await clickControl(page,'Add position block');await clickControl(page,'Add wait block');await selectPosition(page,'home');await clickControl(page,'Add position block');
 const download=page.waitForEvent('download');await clickControl(page,'Save program');const text=await readFile((await (await download).path())!,'utf8');
 await page.reload();expect(await writes(page)).toHaveLength(0);
 // A changed browser library must not change the program-file pose snapshots.
 await page.getByRole('tab',{name:'Positions',exact:true}).click();await clickControl(page,'Clear saved positions');const library=await page.evaluate(()=>localStorage.getItem('nexarm.named-positions.v1'));
 await clickControl(page,'New empty program');await page.locator('#program-file').setInputFiles({name:'positions.json',mimeType:'application/json',buffer:Buffer.from(text)});await expect(page.locator('#program-file-status')).toContainText('loaded for review');
 expect(await page.evaluate(()=>localStorage.getItem('nexarm.named-positions.v1'))).toBe(library);expect(await writes(page)).toHaveLength(0);
 await connect(page);expect(await writes(page)).toHaveLength(0);await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(3600);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);
 await clickControl(page,'Disconnect robot');
});
test('joint programming hides XYZ and rejects old XYZ files without replacing the current program',async({page})=>{
 await station(page);await connect(page);await clickControl(page,'Reload lesson');await page.getByText('Program steps and keyboard editing',{exact:true}).click();
 await expect(page.locator('#add-coordinate, #robot-xyz')).toHaveCount(0);
 await expect(page.locator('.blocklyFlyout:not(.blocklyTrashcanFlyout)')).not.toContainText('move to X');
 await expect(page.getByRole('spinbutton',{name:/repeat count/})).toHaveValue('2');
 const xyz={kind:'coordinates',blockId:'old-xyz',x:39,y:-1,z:-71,pitch:18.4,roll:8,claw:-87,durationMs:1000};
 for(const instructions of [[xyz],[{kind:'repeat',blockId:'old-repeat',count:2,body:[xyz]}]]){
  const file={format:'nexarm-classroom-program',schemaVersion:1,instructions};
  await page.locator('#program-file').setInputFiles({name:'old-xyz.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
  await expect(page.locator('#program-file-status')).toContainText('XYZ coordinate blocks are no longer supported');
  await expect(page.getByRole('spinbutton',{name:/repeat count/})).toHaveValue('2');
  expect(await writes(page)).toHaveLength(0);
 }
 await clickControl(page,'Load short practice program');await clickControl(page,'Run program');await page.clock.runFor(2300);
 await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(2);
 await clickControl(page,'Disconnect robot');
});

test('editing a joint-only program does not connect USB and the simulator stays hidden',async({page})=>{
 await station(page);await clickControl(page,'New empty program');await clickControl(page,'Add wait block');
 await expect(page.locator('#execution-mode, #arm-illustration, #reset, #add-coordinate')).toHaveCount(0);
 expect(await writes(page)).toHaveLength(0);expect(await page.evaluate(()=>(window as unknown as {classroomRobot:{requests:number}}).classroomRobot.requests)).toBe(0);
});

test('after Home readiness, a small J3 pose target completes on its editable duration without arrival',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nexarm.named-positions.v1',JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:[{id:'near',name:'Near',positions:[2050,2150,2127,2200,2000,1080],capturedAt:'2026-10-23T00:00:00Z'}]})));
 await station(page);await connect(page);await page.evaluate(()=>(window as unknown as {classroomRobot:{holding:boolean}}).classroomRobot.holding=false);await page.clock.runFor(300);
 await clickControl(page,'New empty program');await clickControl(page,'Add position block');await page.getByText('Program steps and keyboard editing',{exact:true}).click();
 await page.getByRole('spinbutton',{name:/pose duration seconds/}).fill('2');await page.getByRole('spinbutton',{name:/pose duration seconds/}).dispatchEvent('change');
 await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(1500);await expect(page.locator('#state')).toHaveText('Running');expect(await writes(page)).toHaveLength(6);
 const command=(await writes(page))[2]!;expect(command[2]).toBe(3);expect(command[7]!+256*command[8]!).toBe(2127);
 await page.clock.runFor(700);await expect(page.locator('#state')).toHaveText('Completed');await expect(page.locator('#run-status')).toContainText('timing complete');await expect(page.locator('.joint-card strong').nth(2)).toHaveText('2100');expect(await writes(page)).toHaveLength(6);await clickControl(page,'Disconnect robot');
});
test('a measured 32-unit J3 offset advances through Blockly by frame time without retries',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nexarm.named-positions.v1',JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:[
   {id:'reach',name:'Reach',positions:[2050,2150,2838,2200,2000,1080],capturedAt:'2026-10-23T00:00:00Z'},
   {id:'home',name:'Home',positions:[2050,2150,2100,2200,2000,1080],capturedAt:'2026-10-23T00:00:00Z'}]})));
 await station(page);await connect(page);await clickControl(page,'New empty program');
 await selectPosition(page,'reach');await clickControl(page,'Add position block');await clickControl(page,'Add wait block');await selectPosition(page,'home');await clickControl(page,'Add position block');
 await page.evaluate(()=>(window as unknown as {classroomRobot:{j3Offset:number}}).classroomRobot.j3Offset=32);
 await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2000);
 await expect(page.locator('.joint-card strong').nth(2)).toHaveText('2806');await expect(page.locator('#run-status')).toContainText('Waiting');expect(await writes(page)).toHaveLength(6);
 const first=(await writes(page))[2]!;expect(first[2]).toBe(3);expect(first[7]!+256*first[8]!).toBe(2838);
 await page.clock.runFor(3000);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);await expect(page.locator('.joint-card strong').nth(2)).toHaveText('2068');
 await page.clock.runFor(3000);expect(await writes(page)).toHaveLength(12);await clickControl(page,'Disconnect robot');
});
test('endpoint-path deviations do not interrupt timed pose playback and Stop remains available',async({page})=>{
 await seedPositions(page);await station(page);await connect(page);
 await clickControl(page,'New empty program');
 for(const position of ['pickup','home']){await selectPosition(page,position);await clickControl(page,'Add position block');}
 // Freeze physical tracking and inject in-range readings beyond the current
 // endpoint interval, as can happen during overlapping frames or a reversal.
 await page.evaluate(()=>(window as unknown as {classroomRobot:{holding:boolean}}).classroomRobot.holding=false);
 await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(100);expect(await writes(page)).toHaveLength(6);
 await page.evaluate(()=>{const s=(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot;s.positions.forEach((value,i)=>s.positions[i]=value+240);});
 await page.clock.runFor(100);await expect(page.locator('#state')).toHaveText('Running');await expect(page.locator('#robot-status')).not.toContainText('outside its commanded path');
 await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);await ready(page);
 await expect(page.locator('.joint-card strong').first()).toHaveText('2290');
 await clickControl(page,'Stop');expect(await writes(page)).toHaveLength(13);expect((await writes(page)).at(-1)).toHaveLength(84);
 await page.clock.runFor(1000);expect(await writes(page)).toHaveLength(13);await clickControl(page,'Disconnect robot');
});

test('live recording boxes show ranges beside the name and block every out-of-range or stale capture',async({page})=>{
 await station(page);await connect(page);await page.getByRole('tab',{name:'Positions',exact:true}).click();await clickControl(page,'Release servos for hand positioning');await page.clock.runFor(600);
 const name=page.getByRole('textbox',{name:'Position name'}),record=page.getByRole('button',{name:'Record current position',exact:true});await name.fill('Pickup');
 await expect(page.locator('#teach-readings .teach-reading')).toHaveCount(6);await expect(record).toBeEnabled();
 const nameBox=await name.boundingBox(),readingsBox=await page.locator('#teach-readings').boundingBox();expect(Math.abs(readingsBox!.x-nameBox!.x)).toBeLessThan(5);expect(nameBox!.y-readingsBox!.y).toBeLessThan(300);
 const limits=[[900,3000],[525,2600],[2000,2900],[1250,3000],[1024,3072],[1024,2731]],home=[2050,2150,2100,2200,2000,1080];
 for(let i=0;i<6;i++){
   const box=page.locator(`.teach-reading[data-joint="${i+1}"]`),input=page.getByRole('textbox',{name:`J${i+1} reported position`,exact:true});await expect(box).toContainText(`${limits[i]![0]}–${limits[i]![1]}`);
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
 await clickControl(page,'Disconnect robot');
});
test('invalid recorded targets are flagged and prevent the entire live program without clearing Enable',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nexarm.named-positions.v1',JSON.stringify({format:'nexarm-named-positions',schemaVersion:1,poses:[{id:'t2',name:'t2',positions:[1968,1335,3144,3407,2109,2397],capturedAt:'2026-10-23T00:00:00Z'}]})));
 await station(page);await connect(page);await ready(page);await page.getByRole('tab',{name:'Positions',exact:true}).click();
 await expect(page.locator('#saved-positions')).toContainText('J3 target 3144 is outside its operating range 2000–2900');await expect(page.locator('#saved-positions')).toContainText('J4 target 3407');
 await openPosition(page,'t2');await expect(page.getByRole('button',{name:'Move to position t2',exact:true})).toBeDisabled();
 await clickControl(page,'Load short practice program');await clickControl(page,'Add position block');await clickControl(page,'Run program');
 await expect(page.locator('#run-status')).toContainText('Saved position "t2": J3 target 3144');expect(await writes(page)).toHaveLength(0);await expect(page.locator('#robot-status')).toContainText('Robot enabled');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nexarm.named-positions.v1')!).poses[0].positions)).toEqual([1968,1335,3144,3407,2109,2397]);
 await clickControl(page,'Load short practice program');await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(2);
 await clickControl(page,'Disconnect robot');
});
test('saved pose buttons send six targets after Connect and finish at frame time',async({page})=>{
 await seedPositions(page);await station(page);await connect(page);await page.getByRole('tab',{name:'Positions',exact:true}).click();
 await openPosition(page,'Pickup');const move=page.getByRole('button',{name:'Move to position Pickup',exact:true});await expect(move).toBeEnabled();await ready(page);await move.click();await page.clock.runFor(100);
 await expect(move).toBeDisabled();await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 expect(await writes(page)).toHaveLength(6);expect((await writes(page))[0]).toHaveLength(14);await page.clock.runFor(1200);
 await expect(page.locator('#state')).toHaveText('Complete');await expect(move).toBeEnabled();
 expect(await page.locator('.joint-card strong').allTextContents()).toEqual(['2130','2230','2180','2280','2080','1160']);
 await clickControl(page,'Move to position Home');await page.clock.runFor(1300);await expect(page.locator('#state')).toHaveText('Complete');expect(await writes(page)).toHaveLength(12);
 await clickControl(page,'Disconnect robot');
});
test('Blockly chains named positions and a wait on the station robot without extra enable',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await seedPositions(page);await station(page);
 await clickControl(page,'New empty program');await selectPosition(page,'pickup');await clickControl(page,'Add position block');
 await clickControl(page,'Add wait block');await selectPosition(page,'home');await clickControl(page,'Add position block');
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();expect(await writes(page)).toHaveLength(0);
 await connect(page);await ready(page);await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(700);
 expect(await writes(page)).toHaveLength(6);await page.clock.runFor(600);await expect(page.locator('#run-status')).toContainText('Waiting');expect(await writes(page)).toHaveLength(6);
 await page.clock.runFor(2300);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(12);
 for(const command of await writes(page)){expect(command).toHaveLength(14);expect(command.slice(6,7)).toEqual([10]);expect(command[11]!+256*command[12]!).toBeLessThanOrEqual(600);}
 await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(3600);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(24);expect(errors).toEqual([]);
 await clickControl(page,'Disconnect robot');
});
test('a deleted position blocks compilation without sending commands',async({page})=>{
 await seedPositions(page);await station(page);await connect(page);await ready(page);await clickControl(page,'New empty program');
 await selectPosition(page,'pickup');await clickControl(page,'Add position block');await page.getByRole('tab',{name:'Positions',exact:true}).click();await clickControl(page,'Delete position Pickup');
 await clickControl(page,'Run program');await expect(page.locator('#run-status')).toContainText('saved position is missing');expect(await writes(page)).toHaveLength(0);
 await page.getByText('Program steps and keyboard editing',{exact:true}).click();await page.locator('#keyboard-fields select').selectOption('home');await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(1200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(6);
 await clickControl(page,'Disconnect robot');
});
test('students edit and rerun Blockly programs without another enable or teacher approval',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await station(page);expect(await page.evaluate(()=>(window as unknown as {classroomRobot:{requests:number}}).classroomRobot.requests)).toBe(0);
 await connect(page);expect(await writes(page)).toEqual([]);await ready(page);expect(await writes(page)).toEqual([]);
 await clickControl(page,'Load short practice program');await expect(page.locator('#robot-status')).toContainText('Robot enabled');
 await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);
 await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(2);
 await page.getByText('Program steps and keyboard editing',{exact:true}).click();const target=page.locator('#keyboard-fields input[max="4095"]').first();await target.fill('2140');await target.dispatchEvent('change');
 await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);
 await expect(page.locator('#state')).toHaveText('Completed');const commands=await writes(page);expect(commands).toHaveLength(4);expect(commands[2]![7]!+256*commands[2]![8]!).toBe(2140);
 await expect(page.locator('#robot-status')).toContainText('Robot enabled');expect(errors).toEqual([]);expect(requests.every(url=>url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
 await clickControl(page,'Disconnect robot');
});
test('Stop cancels subsequent blocks and students can recover',async({page})=>{
 await station(page);await connect(page);await ready(page);await clickControl(page,'Load short practice program');
 await clickControl(page,'Load short practice program');await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');
 await page.clock.runFor(100);await clickControl(page,'Stop');const count=(await writes(page)).length;await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(count);
 await expect(page.locator('#state')).toHaveText('Stopped');await ready(page);await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');
 await clickControl(page,'Disconnect robot');
});
test('Stop stays available after a program fault and sends a hold without resuming later blocks',async({page})=>{
 await station(page);await connect(page);await ready(page);await clickControl(page,'Load short practice program');
 await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');
 await page.evaluate(()=>(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot.positions[0]=3900);await page.clock.runFor(100);
 await expect(page.locator('#state')).toHaveText('Fault');await expect(page.getByRole('button',{name:'Stop',exact:true})).toBeEnabled();
 const beforeExport=(await writes(page)).length,download=page.waitForEvent('download');await clickControl(page,'Export robot diagnostics');
 expect((await download).suggestedFilename()).toBe('nexarm-robot-diagnostics.json');expect(await writes(page)).toHaveLength(beforeExport);
 await clickControl(page,'Stop');const commands=await writes(page);expect(commands).toHaveLength(2);expect(commands[1]!.slice(11,13)).toEqual([100,0]);
 await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(2);await clickControl(page,'Disconnect robot');
});

test('stale feedback explains disabled Run and fresh feedback restores it without moving',async({page})=>{
 await station(page);await connect(page);await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=true);await page.clock.runFor(700);
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();await expect(page.locator('#robot-readiness')).toContainText('Waiting for current position feedback');
 await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=false);await page.clock.runFor(100);
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();expect(await writes(page)).toEqual([]);await clickControl(page,'Disconnect robot');
});

test('unfinished release requires Restore but no confirmation or Enable',async({page})=>{
 await station(page);await page.evaluate(()=>localStorage.setItem('nexarm.commissioning.manual-positioning.v1',JSON.stringify({requiresHoldingVerification:true,events:[]})));await connect(page);
 await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 await expect(page.locator('#robot-readiness')).toContainText('Restore servo holding');
 expect(await writes(page)).toEqual([]);await clickControl(page,'Disconnect robot');
});

test('disconnect cancels a live program and reload never reconnects or resumes it',async({page})=>{
 await station(page);await connect(page);await ready(page);await clickControl(page,'Load short practice program');
 await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');
 await clickControl(page,'Disconnect robot');const count=(await writes(page)).length;await page.clock.runFor(2000);expect(await writes(page)).toHaveLength(count);
 await page.reload();await expect(page.locator('#mode-label')).toHaveText('Station robot');expect(await writes(page)).toEqual([]);
 expect(await page.evaluate(()=>(window as unknown as {classroomRobot:{requests:number}}).classroomRobot.requests)).toBe(0);
});

test('obsolete station settings do not block Run or expose editable limits',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nexarm.classroom-profile.v1','invalid obsolete setup'));
 await station(page);await connect(page);await ready(page);
 await expect(page.locator('#station-setup')).toHaveCount(0);await expect(page.locator('#station-limits')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Save station setup'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();
 await clickControl(page,'Load short practice program');await clickControl(page,'Run program');await expect(page.locator('#state')).toHaveText('Running');
 await page.clock.runFor(2200);await expect(page.locator('#state')).toHaveText('Completed');expect(await writes(page)).toHaveLength(2);
 expect(await page.evaluate(()=>localStorage.getItem('nexarm.classroom-profile.v1'))).toBe('invalid obsolete setup');
 await clickControl(page,'Disconnect robot');
});

test('release, hand-position, name and record, then restore holding without a record movement',async({page})=>{
 await station(page);await connect(page);await page.getByRole('tab',{name:'Positions',exact:true}).click();await expect(page.getByRole('button',{name:'Release servos for hand positioning'})).toBeEnabled();
 await clickControl(page,'Release servos for hand positioning');await page.clock.runFor(600);
 expect((await writes(page))[0]).toEqual([255,255,255,3,61,0,192]);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 const pose=[2070,2160,2080,2190,2010,1100];await page.evaluate(pose=>(window as unknown as {classroomRobot:{positions:number[]}}).classroomRobot.positions.splice(0,6,...pose),pose);await page.clock.runFor(100);
 await page.getByRole('textbox',{name:'Position name'}).fill('Pickup');await clickControl(page,'Record current position');
 await expect(page.locator('#saved-positions')).toContainText('Pickup');await expect(page.locator('#saved-positions')).toContainText('S2: 2160');expect(await writes(page)).toHaveLength(1);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('nexarm.named-positions.v1')!));expect(stored.poses[0].positions).toEqual(pose);
 await clickControl(page,'Restore servo holding');await page.clock.runFor(600);expect((await writes(page))[1]).toEqual([255,255,255,3,61,1,191]);
 expect(await writes(page)).toHaveLength(2);
 await ready(page);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeEnabled();
 const download=page.waitForEvent('download');await clickControl(page,'Export saved positions');expect((await download).suggestedFilename()).toBe('nexarm-named-positions.json');expect(await writes(page)).toHaveLength(2);
 await clickControl(page,'Disconnect robot');await page.reload();await expect(page.locator('#saved-positions')).toContainText('Pickup');
 await page.getByRole('tab',{name:'Positions',exact:true}).click();await clickControl(page,'Delete position Pickup');await expect(page.locator('#saved-positions li')).toHaveCount(0);
});

test('stale capture is blocked and interrupted teaching survives reload without automatic restore',async({page})=>{
 await station(page);await connect(page);await page.getByRole('tab',{name:'Positions',exact:true}).click();await clickControl(page,'Release servos for hand positioning');await page.clock.runFor(600);
 await page.getByRole('textbox',{name:'Position name'}).fill('Dropoff');await page.evaluate(()=>(window as unknown as {classroomRobot:{paused:boolean}}).classroomRobot.paused=true);await page.clock.runFor(700);
 await expect(page.getByRole('button',{name:'Record current position',exact:true})).toBeDisabled();expect(await writes(page)).toHaveLength(1);
 await clickControl(page,'Disconnect robot');await page.reload();await connect(page);expect(await writes(page)).toEqual([]);
 await expect(page.locator('#teach-status')).toContainText('Recovery required');await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 await clickControl(page,'Clear saved positions');await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 await clickControl(page,'Disconnect robot');
});
