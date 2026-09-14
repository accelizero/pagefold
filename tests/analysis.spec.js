import {test,expect,chromium} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';
import {extensionId} from '../bridge/install.js';
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
test('analysis button updates draft only, retains manual edits and handles incomplete results and cancellation',async()=>{
 const tmp=await fs.mkdtemp('/tmp/pagefold-analysis-ui-'),extension=path.join(tmp,'extension'),profile=path.join(tmp,'profile');
 await fs.cp(path.resolve('extension'),extension,{recursive:true});
 const hostName=`com.pagefold.analysis_${process.pid}`,bridge=path.join(extension,'native-bridge.js');await fs.writeFile(bridge,(await fs.readFile(bridge,'utf8')).replace('com.pagefold.bridge',hostName));
 const id=extensionId(JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8')).key);
 const hosts=path.join(profile,'NativeMessagingHosts');await fs.mkdir(hosts,{recursive:true});
 const launcher=path.join(tmp,'host.sh');await fs.writeFile(launcher,`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.resolve('tests/fixtures/analysis-host.js'))}\n`,{mode:0o700});
 await fs.writeFile(path.join(hosts,hostName+'.json'),JSON.stringify({name:hostName,description:'Test fixture',path:launcher,type:'stdio',allowed_origins:[`chrome-extension://${id}/`]}));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const doc=await context.newPage();await doc.goto('http://127.0.0.1:4173/?fixture=one');
  const dashboard=await context.newPage();await dashboard.goto(`chrome-extension://${id}/index.html`);
  await expect.poll(()=>dashboard.evaluate(async()=>(await chrome.runtime.sendMessage({type:'bridgeStatus'})).data.connected)).toBe(true);
  const getLayout=()=>dashboard.evaluate(async()=>{const s=(await chrome.runtime.sendMessage({type:'state'})).data;return s.tabs.map(t=>[t.id,t.windowId,t.index,t.url,t.pinned]);});
  const before=await getLayout();
  await expect.poll(()=>dashboard.evaluate(async()=>chrome.action.getBadgeText({}))).toBe(String(before.length));
  await expect.poll(()=>dashboard.evaluate(async()=>(await chrome.runtime.sendMessage({type:"state"})).data.projects.length)).toBe(3);
  await dashboard.getByRole('button',{name:'AI 分析并更新'}).click();await expect(dashboard.locator('#analysis-status')).toContainText('分类已更新');
  await expect(dashboard.locator('[data-rename]').first()).toHaveValue('模型的研究分类');expect(await getLayout()).toEqual(before);
  const rename=dashboard.locator('[data-rename]').first();await rename.fill('我的研究项目');await rename.press('Tab');
  await dashboard.getByRole('button',{name:'AI 分析并更新'}).click();await expect(dashboard.locator('#analysis-status')).toContainText('分类已更新');await expect(rename).toHaveValue('我的研究项目');
  await dashboard.getByRole('button',{name:'AI 分析并更新'}).click();await rename.fill('分析期间的修改');await rename.press('Tab');await expect(dashboard.locator('#analysis-status')).toContainText('保留你的调整');await expect(rename).toHaveValue('分析期间的修改');
  await dashboard.getByRole('button',{name:'AI 分析并更新'}).click();await dashboard.getByRole('button',{name:'取消分析'}).click();await expect(dashboard.locator('#analysis-status')).toContainText('已取消');
  await doc.evaluate(()=>document.title='Incomplete fixture');await dashboard.locator('#refresh').click();
  await dashboard.getByRole('button',{name:'AI 分析并更新'}).click();await expect(dashboard.locator('#analysis-status')).toContainText('遗漏');await expect(rename).toHaveValue('分析期间的修改');
  expect(await getLayout()).toEqual(before);
  await dashboard.evaluate(async()=>{const {draft}=await chrome.storage.local.get('draft');await chrome.storage.local.set({draft:{...draft,sessionId:'before-extension-upgrade'}});});
  await dashboard.reload();await expect(rename).toHaveValue('分析期间的修改');
 }finally{await context.close();await fs.rm(tmp,{recursive:true,force:true});}
});
