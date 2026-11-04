import {expect,test} from '@playwright/test';
import {dragBlock,editNumber} from './toolbox';

declare global{interface Window{programFileMock:{name:string,text:string,pending:string,writes:number}}}

async function installWritableFile(page:import('@playwright/test').Page,text=''){
 await page.addInitScript(initial=>{
  const state={name:'Arm lesson.json',text:initial,pending:'',writes:0};window.programFileMock=state;
  const handle={name:state.name,queryPermission:async()=> 'granted',getFile:async()=>new File([state.text],state.name,{type:'application/json'}),createWritable:async()=>({
   write:async(value:string)=>{state.pending=String(value);},close:async()=>{state.text=state.pending;state.writes++;},abort:async()=>{state.pending='';},
  })};
  Object.defineProperty(window,'showSaveFilePicker',{value:async()=>handle,configurable:true});
  Object.defineProperty(window,'showOpenFilePicker',{value:async()=>[handle],configurable:true});
 },text);
}

test('Save establishes a writable file and later code and name changes update it automatically',async({page})=>{
 await installWritableFile(page);await page.goto('/');await dragBlock(page,'Motion','move joint');
 await page.locator('#file-menu > summary').click();await page.getByRole('button',{name:'Save program',exact:true}).click();
 await expect(page.locator('#program-file-status')).toContainText('Future changes will save automatically');
 expect(await page.evaluate(()=>window.programFileMock.writes)).toBe(1);
 await editNumber(page,'lesson_move','2200');await page.locator('#project-name').fill('Arm challenge');
 await expect(page.locator('#program-file-status')).toHaveText('Saved automatically to Arm lesson.json.',{timeout:5000});
 const saved=await page.evaluate(()=>JSON.parse(window.programFileMock.text));
 expect(saved.name).toBe('Arm challenge');expect(saved.instructions).toMatchObject([{kind:'move',servo:1,target:2200}]);expect(await page.evaluate(()=>window.programFileMock.writes)).toBeGreaterThanOrEqual(2);
});

test('Load through the writable picker replaces the project and keeps saving to that file',async({page})=>{
 const position={id:'pickup',name:'Pickup',positions:[2050,2150,2100,2200,2000,1080],capturedAt:'2026-11-04T12:00:00.000Z'};
 const source=JSON.stringify({format:'nexarm-classroom-program',schemaVersion:5,name:'Loaded lesson',instructions:[{kind:'wait',blockId:'wait',durationMs:1000}],keyEvents:[],positions:[position]});
 await installWritableFile(page,source);await page.goto('/');await page.locator('#file-menu > summary').click();await page.getByRole('button',{name:'Load program',exact:true}).click();
 await expect(page.locator('#project-name')).toHaveValue('Loaded lesson');await expect(page.locator('#program-file-status')).toContainText('Arm lesson.json');
 await page.locator('#project-name').fill('Revised lesson');await page.locator('#saved-positions details > summary').click();await page.getByRole('button',{name:'Delete position Pickup',exact:true}).click();
 await expect(page.locator('#program-file-status')).toHaveText('Saved automatically to Arm lesson.json.',{timeout:5000});
 const saved=JSON.parse(await page.evaluate(()=>window.programFileMock.text));expect(saved.name).toBe('Revised lesson');expect(saved.positions).toEqual([]);
});

test('unsupported browsers retain the download and upload fallback',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true});});
 await page.goto('/');await expect(page.getByRole('button',{name:'Save as new file',exact:true})).toBeHidden();await expect(page.getByRole('button',{name:'Download copy',exact:true})).toBeHidden();
 const downloading=page.waitForEvent('download');await page.locator('#file-menu > summary').click();await page.getByRole('button',{name:'Save program',exact:true}).click();expect((await downloading).suggestedFilename()).toBe('Untitled program.json');
});
