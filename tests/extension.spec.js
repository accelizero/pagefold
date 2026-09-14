import {test,expect,chromium} from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,rm} from 'node:fs/promises';

test('real extension: foreground recording, cross-window apply, selected dedup, recovery and failure journal',async()=>{
 const profile=await mkdtemp(path.join(os.tmpdir(),'pagefold-test-'));
 const extension=path.resolve('extension');
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try {
  let worker=context.serviceWorkers()[0];if(!worker) worker=await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/index.html`);
  const setup=await page.evaluate(async()=>{
   const base='http://127.0.0.1:4173/';
   const w1=await chrome.windows.create({url:base+'?sample=alpha',focused:true});const a=w1.tabs[0];
   const pin=await chrome.tabs.create({windowId:w1.id,url:base+'?sample=pin',pinned:true,active:true});
   const w2=await chrome.windows.create({url:base+'?sample=beta',focused:true});const b=w2.tabs[0];
   const dup=await chrome.tabs.create({windowId:w2.id,url:base+'?sample=alpha',active:false});
   const g=await chrome.tabs.group({tabIds:[b.id,dup.id],createProperties:{windowId:w2.id}});await chrome.tabGroups.update(g,{title:'Original group',color:'purple',collapsed:false});
   for(const t of await chrome.tabs.query({})) if(t.url==='about:blank' && ![a.id,b.id,pin.id,dup.id].includes(t.id) && !t.pendingUrl) await chrome.tabs.remove(t.id);
   await chrome.storage.local.set({events:[],paused:false});
   return {a:a.id,b:b.id,pin:pin.id,dup:dup.id,w1:w1.id,w2:w2.id};
  });
  // Native focus/activation events, including a window change.
  await page.evaluate(async x=>{await chrome.windows.update(x.w1,{focused:true});await chrome.tabs.update(x.a,{active:true});},setup);
  await expect.poll(()=>page.evaluate(async()=>((await chrome.storage.local.get('events')).events||[]).length)).toBeGreaterThan(0);
  await page.evaluate(async x=>{await chrome.windows.update(x.w2,{focused:true});await chrome.tabs.update(x.b,{active:true});},setup);
  await expect.poll(()=>page.evaluate(async()=>new Set(((await chrome.storage.local.get('events')).events||[]).filter(e=>e.url).map(e=>e.windowId)).size)).toBeGreaterThan(1);
  const result=await page.evaluate(async x=>{
   const {fingerprint}=await import('./core.js');
   const response=await chrome.runtime.sendMessage({type:'state'});const s=response.data;
   const p={version:1,source:'manual',fingerprint:fingerprint(s.tabs),groups:[{id:'work',name:'Research',color:'green',tabIds:[x.a,x.b,x.dup]}],closeIds:[x.dup]};
   const r=await chrome.runtime.sendMessage({type:'apply',plan:p});
   const after=(await chrome.runtime.sendMessage({type:'state'})).data;
   return {r,after,plan:p};
  },setup);
  expect(result.r.ok,result.r.error).toBeTruthy();
  expect(result.after.tabs.map(t=>t.id).sort()).toEqual([setup.a,setup.b,setup.pin].sort());
  const a=result.after.tabs.find(t=>t.id===setup.a),b=result.after.tabs.find(t=>t.id===setup.b);
  expect(a.windowId).toBe(b.windowId);expect(a.groupId).toBe(b.groupId);expect(result.after.tabs.find(t=>t.id===setup.pin).pinned).toBeTruthy();
  const extra=await page.evaluate(async wid=>(await chrome.tabs.create({windowId:wid,url:'http://127.0.0.1:4173/?sample=extra',active:false})).id,a.windowId);
  const restored=await page.evaluate(async()=>{const r=await chrome.runtime.sendMessage({type:'restore'});return {r,s:(await chrome.runtime.sendMessage({type:'state'})).data,groups:await chrome.tabGroups.query({})};});
  expect(restored.r.ok,restored.r.error).toBeTruthy();expect(restored.s.tabs).toHaveLength(5);expect(restored.s.tabs.some(t=>t.id===extra)).toBeTruthy();
  expect(restored.s.tabs.find(t=>t.id===setup.a).windowId).toBe(setup.w1);
  expect(restored.groups.some(g=>g.title==='Original group'&&g.color==='purple')).toBeTruthy();
  const beta=restored.s.tabs.find(t=>t.id===setup.b),restoredDup=restored.s.tabs.find(t=>t.id!==setup.a&&t.url.endsWith('?sample=alpha'));
  expect(beta.windowId).toBe(restoredDup.windowId);expect(beta.index).toBeLessThan(restoredDup.index);
  // Failure after a real move leaves a durable snapshot and supports restoration.
  const failure=await page.evaluate(async()=>{
   const {propose}=await import('./core.js'),{applyPlan}=await import('./operations.js');const s=(await chrome.runtime.sendMessage({type:'state'})).data;
   const plan=propose(s.tabs,[]);plan.groups=[{id:'all',name:'All research',color:'blue',tabIds:s.tabs.filter(t=>!t.pinned).map(t=>t.id)}];
   const api={windows:chrome.windows,tabGroups:chrome.tabGroups,storage:chrome.storage,tabs:{query:(...a)=>chrome.tabs.query(...a),move:async()=>{throw Error('Injected move failure');}}};
   let error;try{await applyPlan(api,plan,s.sessionId);}catch(e){error=e.message;}
   return {error,tx:(await chrome.storage.local.get('transaction')).transaction};
  });
  expect(failure.error).toContain('Injected move failure');expect(failure.tx.status).toBe('failed');
  const recovered=await page.evaluate(()=>chrome.runtime.sendMessage({type:'restore'}));expect(recovered.ok,recovered.error).toBeTruthy();
  // Restart guard never treats reused tab IDs as a valid recovery target.
  const invalid=await page.evaluate(async()=>{const {transaction:tx}=await chrome.storage.local.get('transaction');tx.status='applied';tx.before.sessionId='previous-browser-session';await chrome.storage.local.set({transaction:tx});return chrome.runtime.sendMessage({type:'restore'});});
  expect(invalid.ok).toBeFalsy();expect(invalid.error).toContain('重启');
 } finally {await context.close();await rm(profile,{recursive:true,force:true});}
});
