import {test,expect} from '@playwright/test';
test('timeline explains chronological visits, preserves expansion and works on mobile',async({page})=>{
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:'关联线索',exact:false}).click();
 await expect(page.getByRole('heading',{name:'你的访问顺序'})).toBeVisible();
 await expect(page.locator('.timeline-guide')).toContainText('不是停留时长');
 await expect(page.locator('.timeline-track')).toHaveCount(0);
 const first=page.locator('.session').first();await expect(first.locator('.visit-row').first()).toContainText('LEGO');
 await expect(first.locator('.visit-row').first().locator('time')).toHaveText(/\d{2}:\d{2}:\d{2}/);
 await first.locator('summary').click();await expect(first.locator('details')).toHaveAttribute('open','');
 await page.locator('#refresh').click();await expect(first.locator('details')).toHaveAttribute('open','');
 await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'artifacts/pagefold-timeline-v0.4.0.png',fullPage:true});
 await page.getByRole('searchbox').fill('no-such-page-timeline');await expect(page.getByRole('heading',{name:'没有匹配的访问记录'})).toBeVisible();
 await page.getByRole('searchbox').fill('');await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'artifacts/pagefold-timeline-mobile-v0.4.0.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
