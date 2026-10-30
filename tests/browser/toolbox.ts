import {expect} from '@playwright/test';
import type {Page} from '@playwright/test';

/** Exercise the real Blockly toolbox, including snapping a new statement. */
export async function dragBlock(page:Page,category:string,label:string,hat=false){
 const source=page.locator('.blocklyFlyout .blocklyDraggable').filter({has:page.getByText(label,{exact:true})}).first();
 const item=page.getByRole('treeitem',{name:category,exact:true});
 if(await item.getAttribute('aria-selected')!=='true')await item.click();
 await expect(source).toBeVisible();
 const box=await source.locator(':scope > .blocklyPath').boundingBox();if(!box)throw Error('Missing toolbox block');
 const region=page.getByRole('region',{name:'Blocks workspace.',exact:true});
 const paths=await region.locator('g.blocklyDraggable > .blocklyPath').all();
 const boxes=(await Promise.all(paths.map(path=>path.boundingBox()))).filter((b):b is NonNullable<typeof b>=>!!b);
 const tail=boxes.sort((a,b)=>(b.y+b.height)-(a.y+a.height))[0];if(!tail)throw Error('Missing program stack');
 const from={x:box.x+35,y:box.y+12};
 const to=hat?{x:tail.x+340,y:tail.y+12}:{x:tail.x+35,y:tail.y+tail.height+17};
 const mockedClock=await page.evaluate(()=>'classroomRobot' in window);
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+8,from.y+8,{steps:3});
 if(mockedClock)await page.clock.runFor(100);
 await page.mouse.move(to.x,to.y,{steps:15});if(mockedClock)await page.clock.runFor(100);await page.mouse.up();
 // Flush Blockly's deferred change events even in mocked-clock station tests.
 if(mockedClock)await page.clock.runFor(100);
}
