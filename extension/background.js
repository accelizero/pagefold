import {manageable, pageURL, DAY, retainEvents, analysisURL} from './core.js';
import {defaultProjects,validateProjects} from './insights.js';
import {importHistory} from './history-import.js';
import {closeTab,reopenTab} from './tab-actions.js';
import {applyPlan, restore} from './operations.js';
import {bridgeStatus,connectBridge,setBridgeEnabled,startAnalysis,analysisStatus,cancelAnalysis} from './native-bridge.js';

let queue=Promise.resolve(), busy=false;
const serial=fn=>{const work=queue.then(fn);queue=work.catch(()=>{});return work;};
async function sessionId() {
  const data=await chrome.storage.session.get('sessionId');
  if(data.sessionId) return data.sessionId;
  const id=crypto.randomUUID();await chrome.storage.session.set({sessionId:id});return id;
}
function record(type,tab) {
  const ts=Date.now();
  return serial(async()=>{
    if(busy || (tab && !manageable(tab))) return;
    const data=await chrome.storage.local.get(['events','paused']);
    if(data.paused) return;
    const e={type,ts,sessionId:await sessionId()};
    if(tab) Object.assign(e,{tabId:tab.id,windowId:tab.windowId,url:analysisURL(pageURL(tab)).slice(0,4096),title:(tab.title||'').slice(0,500)});
    const events=(data.events||[]).filter(e=>e.ts>ts-30*DAY);
    const last=events.at(-1);
    if(tab && last && last.url===e.url && last.tabId===e.tabId && ts-last.ts<1500) return;
    events.push(e);await chrome.storage.local.set({events:retainEvents(events,ts)});
  }).catch(e=>console.warn('Pagefold recording:',e.message));
}
async function foreground(type,tabId) {
  try {
    const t=await chrome.tabs.get(tabId),w=await chrome.windows.get(t.windowId);
    if(w.type==='normal' && w.focused && t.active && await chrome.idle.queryState(120)==='active') {
      if(manageable(t)) await record(type,t); else await record('blur');
    }
  } catch {}
}
chrome.tabs.onActivated.addListener(({tabId})=>foreground('activate',tabId));
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.url) foreground('navigate',id);});
chrome.windows.onFocusChanged.addListener(async id=>{
  if(id===chrome.windows.WINDOW_ID_NONE) {await record('blur');return;}
  try {const [t]=await chrome.tabs.query({active:true,windowId:id});if(t) await foreground('focus',t.id);} catch {}
});
chrome.idle.onStateChanged.addListener(async state=>{
  if(state!=='active') await record('idle');
  else {const [t]=await chrome.tabs.query({active:true,lastFocusedWindow:true});if(t) await foreground('focus',t.id);}
});
chrome.idle.setDetectionInterval(120);
async function openDashboard() {
  const url=chrome.runtime.getURL('index.html');
  const existing=(await chrome.tabs.query({})).find(t=>t.url===url);
  if(existing) {await chrome.windows.update(existing.windowId,{focused:true});await chrome.tabs.update(existing.id,{active:true});}
  else await chrome.tabs.create({url});
}
chrome.action.onClicked.addListener(openDashboard);
chrome.commands.onCommand.addListener(name=>{if(name==='open-dashboard') openDashboard();});
chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await sessionId();
});
async function dispatch(message) {
    if(message.type==='state') {
      await queue;
      const windows=(await chrome.windows.getAll({populate:true,windowTypes:['normal']})).filter(w=>!w.incognito);
      const data=await chrome.storage.local.get(['events','paused','transaction','draft','projects','historyImport','analysisReports','archivedGroups','analysisSource']);
      const events=(data.events||[]).filter(e=>e.ts>Date.now()-30*DAY);
      const {closedTabs=[]}=await chrome.storage.session.get('closedTabs');
      return {...data,closedTabs:closedTabs.filter(e=>e.status==='closed'),projects:data.projects||defaultProjects,events,windows:windows.map(w=>({...w,tabs:w.tabs.filter(manageable)})),tabs:windows.flatMap(w=>w.tabs.filter(manageable)),sessionId:await serial(sessionId),busy};
    }
    if(message.type==='saveProjects') {const projects=validateProjects(message.projects);await chrome.storage.local.set({projects,projectsRevision:crypto.randomUUID()});return projects;}
    if(message.type==='importHistory') {const historyImport=await importHistory(chrome);await chrome.storage.local.set({historyImport,analysisSource:'both'});return historyImport;}
    if(message.type==='analysisSource') {if(!['foreground','history','both'].includes(message.value))throw Error('无效的来源');return chrome.storage.local.set({analysisSource:message.value});}
    if(message.type==='clearHistoryImport') return chrome.storage.local.remove('historyImport');
    if(message.type==='pause') {
      return serial(async()=>{
        const data=await chrome.storage.local.get('events');
        await chrome.storage.local.set({paused:!!message.value,events:retainEvents([...(data.events||[]),{type:'pause',ts:Date.now(),sessionId:await sessionId()}])});
      });
    }
    if(message.type==='clearEvents') return serial(()=>chrome.storage.local.set({events:[]}));
    if(message.type==='discardRecovery') {if(busy)throw Error('操作正在进行，请稍后再试。');return chrome.storage.local.remove('transaction');}
    if(message.type==='focus') {const t=await chrome.tabs.get(message.id);await chrome.windows.update(t.windowId,{focused:true});await chrome.tabs.update(t.id,{active:true});return;}
    if(message.type==='openDashboard') return openDashboard();
    if(message.type==='panel') {const w=await chrome.windows.getCurrent();return chrome.sidePanel.open({windowId:w.id});}
    if(['closeTab','reopenTab'].includes(message.type)) {
      if(busy)throw Error('正在整理或处理页面，请稍后再试。');busy=true;
      try{await queue;const current=await sessionId();return message.type==='closeTab'?await closeTab(chrome,message,current):await reopenTab(chrome,message.id,current);}finally{busy=false;}
    }
    if(['apply','restore'].includes(message.type)) {
      if(busy) throw Error('正在处理上一个操作。');
      busy=true;
      try {await queue;const id=await sessionId();return message.type==='apply'?await applyPlan(chrome,message.plan,id):await restore(chrome,id);}
      finally {busy=false;await record('pause');}
    }
    if(message.type==='analyzeStart')return startAnalysis();
    if(message.type==='analyzeStatus')return analysisStatus();
    if(message.type==='analyzeCancel')return cancelAnalysis();
    if(message.type==='bridgeStatus') return {...bridgeStatus(),enabled:(await chrome.storage.local.get('bridgeEnabled')).bridgeEnabled!==false};
    if(message.type==='bridgeEnabled') return setBridgeEnabled(message.value);
    if(message.type==='bridgeReconnect') {await connectBridge();return bridgeStatus();}
    throw Error('未知操作。');
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')))return;
  dispatch(message).then(data=>respond({ok:true,data})).catch(error=>respond({ok:false,error:error.message}));return true;
});
connectBridge(dispatch);
chrome.runtime.onStartup.addListener(()=>connectBridge(dispatch));

let badgeTimer;
async function updateBadge(){try{const windows=await chrome.windows.getAll({populate:true,windowTypes:['normal']});const count=windows.filter(w=>!w.incognito).flatMap(w=>w.tabs.filter(manageable)).length;await chrome.action.setBadgeText({text:count>999?'999+':String(count)});await chrome.action.setBadgeBackgroundColor({color:'#496b57'});await chrome.action.setTitle({title:'拾页 · '+count+' 个页面（普通窗口，不含扩展页）'});}catch{}}
const scheduleBadge=()=>{clearTimeout(badgeTimer);badgeTimer=setTimeout(updateBadge,150);};
chrome.tabs.onCreated.addListener(scheduleBadge);chrome.tabs.onRemoved.addListener(scheduleBadge);chrome.tabs.onUpdated.addListener(scheduleBadge);chrome.tabs.onAttached.addListener(scheduleBadge);chrome.windows.onRemoved.addListener(scheduleBadge);chrome.runtime.onStartup.addListener(updateBadge);chrome.runtime.onInstalled.addListener(updateBadge);updateBadge();
