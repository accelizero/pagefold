import {test,expect,chromium} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';
test('direct close and undo work from workspace, including pinned confirmation and closed-window recovery',async()=>{
 const profile=await fs.mkdtemp('/tmp/pagefold-close-'),extension=path.resolve('extension');const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host,page=await context.newPage();await page.goto(`chrome-extension://${id}/index.html`);
  const setup=await page.evaluate(async()=>{await chrome.storage.local.set({paused:true});const w=await chrome.windows.create({url:'http://127.0.0.1:4173/?close-fixture',focused:false});const pin=await chrome.tabs.create({url:'http://127.0.0.1:4173/?pin-fixture',windowId:w.id,pinned:true,active:false});return {normal:w.tabs[0].id,pin:pin.id};});
  await page.locator('#refresh').click();const before=await page.evaluate(async()=>{const s=(await chrome.runtime.sendMessage({type:'state'})).data;return {count:s.tabs.length,events:s.events.length};});
  const stale=await page.evaluate(async id=>{const state=(await chrome.runtime.sendMessage({type:'state'})).data;return chrome.runtime.sendMessage({type:'closeTab',id,expectedUrl:'https://wrong.test',sessionId:state.sessionId});},setup.normal);expect(stale.ok).toBe(false);
  const unconfirmed=await page.evaluate(async id=>{const state=(await chrome.runtime.sendMessage({type:'state'})).data,t=state.tabs.find(t=>t.id===id);return chrome.runtime.sendMessage({type:'closeTab',id,expectedUrl:t.url,sessionId:state.sessionId});},setup.pin);expect(unconfirmed.ok).toBe(false);
  await page.locator(`[data-close-tab="${setup.normal}"]`).click();await expect(page.locator(`[data-close-tab="${setup.normal}"]`)).toHaveCount(0);await expect(page.locator('#close-status')).toContainText('未保存内容无法恢复');
  await expect.poll(()=>page.evaluate(()=>chrome.action.getBadgeText({}))).toBe(String(before.count-1));
  await page.reload();await expect(page.locator('[data-reopen-tab]')).toBeVisible();const closedId=await page.locator('[data-reopen-tab]').getAttribute('data-reopen-tab');await page.locator('[data-reopen-tab]').click();
  await expect.poll(()=>page.evaluate(async()=>((await chrome.runtime.sendMessage({type:'state'})).data.tabs.length))).toBe(before.count);
  const again=await page.evaluate(id=>chrome.runtime.sendMessage({type:'reopenTab',id}),closedId);expect(again.ok).toBe(true);expect(await page.evaluate(async()=>((await chrome.runtime.sendMessage({type:'state'})).data.tabs.length))).toBe(before.count);
  await page.locator(`[data-close-tab="${setup.pin}"]`).click();await expect(page.locator('dialog')).toContainText('固定页面');await page.locator('#confirm-close-tab').click();await expect(page.locator(`[data-close-tab="${setup.pin}"]`)).toHaveCount(0);await page.locator('[data-reopen-tab]').click();
  expect(await page.evaluate(async()=>((await chrome.tabs.query({pinned:true})).some(t=>t.url.includes('pin-fixture'))))).toBe(true);
  const single=await page.evaluate(async()=>{const w=await chrome.windows.create({url:'http://127.0.0.1:4173/?last-tab',focused:false});return w.tabs[0].id;});await page.locator('#refresh').click();await page.locator(`[data-close-tab="${single}"]`).click();await page.locator('[data-reopen-tab]').click();
  expect(await page.evaluate(async()=>((await chrome.tabs.query({})).filter(t=>t.url.includes('?last-tab')).length))).toBe(1);
  expect(await page.evaluate(async()=>((await chrome.runtime.sendMessage({type:'state'})).data.events.length))).toBe(before.events);
 }finally{await context.close();await fs.rm(profile,{recursive:true,force:true});}
});
test('demo close and undo update counts without introducing navigation',async({page})=>{
 await page.goto('http://127.0.0.1:4173');const count=await page.locator('[data-close-tab]').count();await page.locator('[data-close-tab]').first().click();await expect(page.locator('[data-close-tab]')).toHaveCount(count-1);await page.locator('[data-reopen-tab]').click();await expect(page.locator('[data-close-tab]')).toHaveCount(count);await expect(page.locator('.primary-nav > button')).toHaveCount(3);
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/pagefold-close-v0.4.2.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
