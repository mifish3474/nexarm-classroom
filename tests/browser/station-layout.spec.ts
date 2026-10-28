import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('station opens directly into code without USB access, with project actions in File',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{get(){throw Error('USB accessed without Connect');}}));
 await page.goto('/');await expect(page.locator('#mode-label')).toHaveText('Station robot');
 await expect(page.locator('#execution-mode, #arm-illustration, #reset, .animation-controls')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Your virtual robot'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Connect robot',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Release servos for hand positioning'})).toBeVisible();
 await page.locator('#file-menu > summary').click();await page.getByRole('button',{name:'New empty program',exact:true}).click();await expect(page.locator('#file-menu')).not.toHaveAttribute('open','');
 await page.locator('#file-menu > summary').click();await expect(page.getByRole('button',{name:'Save program',exact:true})).toBeEnabled();expect(errors).toEqual([]);
 expect(requests.every(url=>url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
});
test('code and Stop fit classroom screens; narrow layouts keep Stop reachable while scrolling',async({page})=>{
 for(const [width,height] of [[1366,768],[1280,720],[1024,768],[768,800],[390,844]]){
  await page.setViewportSize({width:width!,height:height!});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const editor=await page.locator('#blockly-editor').boundingBox();expect(editor!.y,`Editor position at ${width}x${height}`).toBeLessThan(width!>850?180:270);expect(editor!.height).toBeGreaterThan(300);
  if(width!>850){expect(editor!.width).toBeGreaterThan(650);expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(height!);}
  await page.locator('#teach-panel').evaluate(node=>node.scrollTop=node.scrollHeight);await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  const stop=await page.locator('#stop').boundingBox();expect(stop!.y).toBeGreaterThanOrEqual(0);expect(stop!.y+stop!.height).toBeLessThanOrEqual(height!);
  await page.screenshot({path:`test-results/workspace-${width}.png`});
 }
});

test('inspector tabs support keyboard navigation; menus close on Escape and preserve focus',async({page})=>{
 await page.goto('/');await page.getByRole('tab',{name:'Positions',exact:true}).focus();await page.keyboard.press('ArrowLeft');
 await expect(page.getByRole('tab',{name:'Robot',exact:true})).toBeFocused();await expect(page.locator('#teach-panel')).toBeHidden();await expect(page.locator('#robot-panel')).toBeVisible();
 await page.keyboard.press('End');await expect(page.locator('#teach-panel')).toBeVisible();
 await page.locator('#file-menu > summary').click();await page.keyboard.press('Tab');await page.keyboard.press('Escape');await expect(page.locator('#file-menu > summary')).toBeFocused();await expect(page.locator('#file-menu')).not.toHaveAttribute('open','');
});

test('adding and undoing blocks works without hardware, with a single empty starting block',async({page})=>{
 await page.goto('/');await page.getByText('Program steps and keyboard editing',{exact:true}).click();await expect(page.locator('#keyboard-fields input')).toHaveCount(0);
 await page.locator('#add-block-menu > summary').click();await page.getByRole('button',{name:'Add joint block',exact:true}).click();await expect(page.locator('#keyboard-fields input')).toHaveCount(2);
 await page.getByRole('button',{name:'Undo edit',exact:true}).click();await expect(page.locator('#keyboard-fields input')).toHaveCount(0);
 await page.getByRole('button',{name:'Redo edit',exact:true}).click();await expect(page.locator('#keyboard-fields input')).toHaveCount(2);
});

test('students create a variable and append set, change and if/else blocks through the interface',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{get(){throw Error('USB accessed during offline editing');}}));
 await page.goto('/');await page.getByRole('treeitem',{name:'Variables',exact:true}).click();
 await page.getByText('Create variable...',{exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox').fill('counter');await dialog.getByRole('button',{name:'OK',exact:true}).click();
 for(const name of ['Add set variable block','Add change variable block','Add if/else block','Add wait block']){
  await page.locator('#add-block-menu > summary').click();await page.getByRole('button',{name,exact:true}).click();
 }
 await page.getByText('Program steps and keyboard editing',{exact:true}).click();
 const initial=page.getByRole('spinbutton',{name:/set value for counter/});await initial.fill('2');await initial.dispatchEvent('change');
 await page.getByRole('button',{name:'Check program',exact:true}).click();await expect(page.locator('#run-status')).toContainText('Program checked: 1');await expect(page.locator('#variable-values')).toContainText('counter = 3');expect(errors).toEqual([]);
});

test('adding a keyboard hat selects its stack for quick-add blocks and saves it without USB',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{get(){throw Error('USB accessed while building key events');}}));await page.goto('/');
 await page.locator('#add-block-menu > summary').click();await page.getByRole('button',{name:'Add key event block',exact:true}).click();
 await page.locator('#add-block-menu > summary').click();await expect(page.locator('#program-stack option:checked')).toHaveText('When A pressed');await page.getByRole('button',{name:'Add wait block',exact:true}).click();
 await page.getByRole('button',{name:'Check program',exact:true}).click();await expect(page.locator('#run-status')).toContainText('Program checked: 0');await expect(page.locator('#run-status')).toContainText('1 keyboard event stacks');
 const download=page.waitForEvent('download');await page.locator('#file-menu > summary').click();await page.getByRole('button',{name:'Save program',exact:true}).click();const data=JSON.parse(await readFile((await (await download).path())!,'utf8'));
 expect(data.instructions).toEqual([]);expect(data.keyEvents).toMatchObject([{key:'a',body:[{kind:'wait',durationMs:1000}]}]);
 await page.locator('#add-block-menu > summary').click();await page.getByRole('button',{name:'Add key event block',exact:true}).click();await page.getByRole('button',{name:'Check program',exact:true}).click();await expect(page.locator('#run-status')).toContainText('one When A');
});
