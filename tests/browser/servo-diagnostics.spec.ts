import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function setup(page:Page,mode:'normal'|'mixed'|'missing'|'factory-only'='normal'){
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
 await page.addInitScript(({mode})=>{
  const state={writes:[] as number[][],requests:0,closes:0,unexpected:[] as number[][]};Object.assign(window,{diagRobot:state});
  const packet=(id:number,field:number,data:number[])=>{const body=[id,data.length+2,field,...data];return Uint8Array.from([255,255,...body,(~body.reduce((a,b)=>a+b,0))&255]);};
  Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{
   state.requests++;let receiver:ReadableStreamDefaultController<Uint8Array>,closed=false;
   return {open:async()=>{},close:async()=>{state.closes++;closed=true;},getInfo(){throw Error('Must not collect device identifiers');},
    readable:new ReadableStream<Uint8Array>({start(controller){receiver=controller;},cancel(){closed=true;}}),
    writable:new WritableStream<Uint8Array>({write(bytes){
     const b=[...bytes];state.writes.push(b);
     if(!((b[2]===255&&((b.length===6&&b[4]===1)||(b.length===7&&[71,75].includes(b[4]!)&&b[5]!>=1&&b[5]!<=6)))||(b[2]!>=1&&b[2]!<=6&&b.length===8&&b[4]===2))){state.unexpected.push(b);throw Error('Unsafe packet');}
     if(mode==='missing'||(mode==='mixed'&&b[2]===2)||(mode==='factory-only'&&b[2]!==255))return;
     const id=b[2]!,kind=b[5],data=id===255?(b[4]===1?[1,0,2,1,0,2]:b[4]===71?[b[5]!,20,200,80]:[b[5]!,b[5]===2?0:232,b[5]===2?0:3]):kind===0?[2,43,0,30,0]:kind===13?Array.from({length:27},(_,i)=>i===7?16:i===21?20:i===22?200:i===23?80:0):b[6]===2?[0,8]:[0,8,0,0,100,0,120,30,0,16,0,0,0,250,0];
     const error=mode==='mixed'&&id===3&&kind===56&&b[6]===15;
     setTimeout(()=>{if(!closed)receiver.enqueue(packet(id,id===255?b[4]!:error?16:0,error?[]:data));},5);
    }})};
  }}});
 },{mode});
 await page.goto('/servo-diagnostics.html');
}
const state=(page:Page)=>page.evaluate(()=>(window as unknown as {diagRobot:{writes:number[][];requests:number;closes:number;unexpected:number[][]}}).diagRobot);

test('read-only scan requires explicit Start, exports raw observations and sends only finite READ requests without storage or uploads',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await setup(page);await expect(page.locator('[data-app-version]')).toHaveText('Version 0.7.0-dev.45');expect((await state(page)).requests).toBe(0);await expect(page.getByRole('checkbox')).toHaveCount(0);
 await page.getByRole('button',{name:'Connect for diagnostics'}).click();await page.clock.runFor(200);expect((await state(page)).writes).toHaveLength(0);
 await page.getByRole('button',{name:'Read diagnostics',exact:true}).click();await page.clock.runFor(10000);await expect(page.locator('#diag-state')).toContainText('Complete');
 const robot=await state(page);expect(robot.writes).toHaveLength(49);expect(robot.unexpected).toHaveLength(0);await expect(page.locator('#diag-controller')).toContainText('ESP32 1.0.2; AT32 1.0.2');
 await expect(page.locator('[data-servo="1"]')).toContainText('unmapped model code 0x001e');await expect(page.locator('[data-servo="6"]')).toContainText('motor current 250');await expect(page.locator('[data-servo="6"]')).toContainText('status byte 0x10');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export read-only diagnostics'}).click();const file=await download;expect(file.suggestedFilename()).toBe('nexarm-read-only-servo-diagnostics.json');
 const report=JSON.parse(await readFile((await file.path())!,'utf8'));expect(report.constraints).toMatchObject({readOnly:true,maxRequests:49,unitsVerified:false,personnelProtectionVerified:false});expect(report.results).toHaveLength(49);expect(report.results.at(-1).decoded).toMatchObject({currentRaw:250,statusByteRaw:16,interpretationVerified:false});
 expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);expect(requests.every(url=>url.startsWith('http://127.0.0.1:4173/'))).toBe(true);expect(errors).toEqual([]);
 await expect(page.getByRole('button',{name:'Read diagnostics',exact:true})).toBeDisabled();await page.clock.runFor(10000);expect((await state(page)).writes).toHaveLength(49);await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});

test('unavailable reads and servo error replies are visible without fabricated zero readings',async({page})=>{
 await setup(page,'mixed');await page.getByRole('button',{name:'Connect for diagnostics'}).click();await page.getByRole('button',{name:'Read diagnostics',exact:true}).click();await page.clock.runFor(15000);
 await expect(page.locator('#diag-state')).toContainText('Complete');await expect(page.locator('[data-servo="2"] [data-read-kind="position"]')).toContainText('timeout');await expect(page.locator('[data-servo="2"] [data-read-kind="identity"]')).toContainText('skipped');await expect(page.locator('[data-servo="2"]')).not.toContainText('motor current 0');
 await expect(page.locator('[data-servo="2"] [data-read-kind="status"]')).toContainText('skipped');await expect(page.locator('[data-servo="3"] [data-read-kind="status"]')).toContainText('error byte 0x10');
 expect((await state(page)).writes).toHaveLength(44);expect((await state(page)).unexpected).toHaveLength(0);await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});

test('factory API results remain available when direct servo reads are unavailable',async({page})=>{
 await setup(page,'factory-only');await page.getByRole('button',{name:'Connect for diagnostics'}).click();await page.getByRole('button',{name:'Read diagnostics',exact:true}).click();await page.clock.runFor(12000);
 await expect(page.locator('#diag-state')).toContainText('Complete');await expect(page.locator('#diag-controller')).toContainText('ESP32 1.0.2; AT32 1.0.2');
 await expect(page.locator('[data-servo="1"] [data-read-kind="factory-overload"]')).toContainText('post-overload cap 20');await expect(page.locator('[data-servo="2"] [data-read-kind="factory-max-torque"]')).toContainText('maximum torque 0');await expect(page.locator('[data-servo="2"] [data-read-kind="factory-max-torque"]')).toContainText('meaning remains unverified');await expect(page.locator('[data-servo="1"] [data-read-kind="status"]')).toContainText('skipped');
 expect((await state(page)).writes).toHaveLength(19);expect((await state(page)).unexpected).toHaveLength(0);await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});

test('Stop reads cancels future requests, keeps partial export, and reconnect does not automatically repeat the scan',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Connect for diagnostics'}).click();await page.getByRole('button',{name:'Read diagnostics',exact:true}).click();await page.clock.runFor(250);await page.getByRole('button',{name:'Stop reads',exact:true}).click();
 const count=(await state(page)).writes.length;await page.clock.runFor(5000);expect((await state(page)).writes).toHaveLength(count);await expect(page.locator('#diag-state')).toContainText('Canceled');await expect(page.getByRole('button',{name:'Export read-only diagnostics'})).toBeEnabled();
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.getByRole('button',{name:'Connect for diagnostics'}).click();await page.clock.runFor(500);expect((await state(page)).writes).toHaveLength(count);await expect(page.getByRole('button',{name:'Read diagnostics',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Export read-only diagnostics'})).toBeDisabled();await page.getByRole('button',{name:'Disconnect',exact:true}).click();
});

test('the diagnostic layout fits a narrow screen and is reachable from the classroom footer',async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('button',{name:'Read diagnostics',exact:true})).toBeDisabled();
 await page.goto('/');await expect(page.getByRole('link',{name:'Read-only servo diagnostics',exact:true})).toHaveAttribute('href','./servo-diagnostics.html');expect((await state(page)).writes).toHaveLength(0);
});
