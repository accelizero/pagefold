import {test,expect,chromium} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';
test('Chrome history import reads repeat navigation locally and supports history-only analysis while recording is paused',async()=>{
 const tmp=await fs.mkdtemp('/tmp/pagefold-history-'),extension=path.join(tmp,'extension');await fs.cp(path.resolve('extension'),extension,{recursive:true});
 // Required permission is used only in this disposable test extension/profile.
 const file=path.join(extension,'manifest.json'),manifest=JSON.parse(await fs.readFile(file,'utf8'));manifest.permissions.push('history');delete manifest.optional_permissions;await fs.writeFile(file,JSON.stringify(manifest));
 const context=await chromium.launchPersistentContext(path.join(tmp,'profile'),{channel:'chromium',headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host,page=await context.newPage();await page.goto(`chrome-extension://${id}/index.html`);
  await page.evaluate(async()=>{await chrome.storage.local.set({paused:true,events:[]});await chrome.history.addUrl({url:'https://history-fixture.test/a?token=PRIVATE_TEST'});await chrome.history.addUrl({url:'https://history-fixture.test/b'});await chrome.history.addUrl({url:'https://history-fixture.test/a?token=PRIVATE_TEST'});});
  const imported=await page.evaluate(async()=>{const result=await chrome.runtime.sendMessage({type:'importHistory'});if(!result.ok)throw Error(result.error);return result.data;});expect(imported.visits.filter(v=>v.url.startsWith('https://history-fixture.test/'))).toHaveLength(3);expect(JSON.stringify(imported)).not.toContain('PRIVATE_TEST');
  await page.reload();await page.locator('[data-view="analysis"]').click();await expect(page.locator('#content')).toContainText('上次导入');await page.locator('#analysis-source').selectOption('history');
  const state=await page.evaluate(async()=>(await chrome.runtime.sendMessage({type:'state'})).data);expect(state.paused).toBe(true);expect(state.analysisSource).toBe('history');expect(state.events).toHaveLength(0);
  await page.locator('#clear-import').click();await expect(page.locator('#content')).toContainText('尚未导入 Chrome 历史');expect(await page.evaluate(async()=>(await chrome.history.search({text:'history-fixture',maxResults:10})).length)).toBe(2);
 }finally{await context.close();await fs.rm(tmp,{recursive:true,force:true});}
});
