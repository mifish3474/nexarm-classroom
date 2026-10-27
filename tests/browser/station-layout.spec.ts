import {expect,test} from '@playwright/test';
test('station robot is the only view, with connection and holding controls above Run and no automatic USB access',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await page.addInitScript(()=>Object.defineProperty(navigator,'serial',{get(){throw Error('USB accessed without Connect');}}));
 await page.goto('/');await expect(page.locator('#mode-label')).toHaveText('Station robot');
 await expect(page.locator('#execution-mode, #arm-illustration, #reset, .animation-controls')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Your virtual robot'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Run program',exact:true})).toBeDisabled();
 const run=await page.getByRole('button',{name:'Run program',exact:true}).boundingBox();
 for(const name of ['Connect robot','Release servos for hand positioning','Restore servo holding']){const button=page.getByRole('button',{name,exact:true});await expect(button).toBeVisible();const box=await button.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(run!.y);}
 await page.getByRole('button',{name:'New empty program',exact:true}).click();await expect(page.getByRole('button',{name:'Save program',exact:true})).toBeEnabled();expect(errors).toEqual([]);
 expect(requests.every(url=>url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
});
test('station layout fits a Chromebook and narrow phone without a virtual-arm frame',async({page})=>{
 for(const width of [768,390]){await page.setViewportSize({width,height:800});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('button',{name:'Connect robot',exact:true})).toBeVisible();}
 await page.screenshot({path:'test-results/station-layout.png',fullPage:true});
});
