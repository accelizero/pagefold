import {manageable,pageURL,reconcilePlan} from './core.js';
const getEntries=async api=>(await api.storage.session.get('closedTabs')).closedTabs||[];
const saveEntries=(api,entries)=>api.storage.session.set({closedTabs:entries.slice(-20)});
export async function closeTab(api,{id,expectedUrl,sessionId,confirmed=false},currentSession){
 if(sessionId!==currentSession)throw Error('页面快照已过期，请刷新后再关闭。');
 const t=await api.tabs.get(id),w=await api.windows.get(t.windowId);
 if(!manageable(t)||w.type!=='normal'||pageURL(t)!==expectedUrl)throw Error('页面已变化，请刷新后确认要关闭的页面。');
 if((t.pinned||t.audible)&&!confirmed)throw Error('这是固定页或正在播放声音的页面，请确认后再关闭。');
 const {draft}=await api.storage.local.get('draft'),g=draft?.plan?.groups.find(g=>g.tabIds.includes(id));
 const entry={id:crypto.randomUUID(),sessionId:currentSession,at:Date.now(),status:'closing',tab:{id:t.id,url:pageURL(t),title:t.title,windowId:t.windowId,index:t.index,pinned:!!t.pinned},group:g?{id:g.id,name:g.name,color:g.color,reason:g.reason,tags:g.tags}:null};
 let entries=await getEntries(api);entries.push(entry);await saveEntries(api,entries);
 try{const fresh=await api.tabs.get(id);if(!manageable(fresh)||pageURL(fresh)!==expectedUrl||((fresh.pinned||fresh.audible)&&!confirmed))throw Error('页面状态刚刚变化，请刷新后重新确认。');await api.tabs.remove(id);}catch(error){entry.status='failed';await saveEntries(api,entries);throw error;}
 let remains;try{remains=await api.tabs.get(id);}catch{}
 if(remains){entry.status='failed';await saveEntries(api,entries);throw Error('页面尚未关闭，请检查 Chrome 中的提示。');}
 entry.status='closed';await saveEntries(api,entries);await api.storage.local.set({draftRevision:crypto.randomUUID()});return entry;
}
export async function reopenTab(api,id,currentSession){
 const entries=await getEntries(api),entry=entries.find(e=>e.id===id);
 if(!entry||entry.sessionId!==currentSession)throw Error('这条关闭记录已过期。');
 if(entry.status==='reopened')return entry;
 if(entry.status!=='closed')throw Error('这次重新打开的结果尚未确认，请先检查 Chrome，避免重复打开。');
 if(!/^(https?:|file:|chrome:|about:)/.test(entry.tab.url))throw Error('这个网址无法直接重新打开，请使用 Chrome 的最近关闭记录。');
 let w;try{w=await api.windows.get(entry.tab.windowId);}catch{}
 entry.status='reopening';await saveEntries(api,entries);
 let t;
 try{
  if(w?.type==='normal'&&!w.incognito){const siblings=await api.tabs.query({windowId:w.id});t=await api.tabs.create({url:entry.tab.url,windowId:w.id,index:Math.min(entry.tab.index,siblings.length),active:false,pinned:entry.tab.pinned});}
  else {const created=await api.windows.create({url:entry.tab.url,focused:false});t=created.tabs[0];}
 }catch(error){entry.status='closed';await saveEntries(api,entries);throw error;}
 entry.status='reopened';entry.newTabId=t.id;await saveEntries(api,entries);
 if(entry.tab.pinned&&!t.pinned){try{await api.tabs.update(t.id,{pinned:true});}catch{entry.pinRestoreFailed=true;await saveEntries(api,entries);}}
 // Reconcile the current draft, never revive old duplicate-close selections.
 const {draft}=await api.storage.local.get('draft');
 if(draft?.plan){const tabs=(await api.tabs.query({windowType:'normal'})).filter(manageable);const plan=reconcilePlan(draft.plan,tabs);
  if(entry.group&&!entry.tab.pinned){for(const g of plan.groups){g.tabIds=g.tabIds.filter(id=>id!==t.id);g.lockedIds=(g.lockedIds||[]).filter(id=>id!==t.id);}let dest=plan.groups.find(g=>g.id===entry.group.id&&g.name===entry.group.name);if(!dest){dest={...entry.group,id:crypto.randomUUID(),tabIds:[]};plan.groups.push(dest);}dest.tabIds.push(t.id);dest.lockedIds=[...(dest.lockedIds||[]),t.id];plan.groups=plan.groups.filter(g=>g.tabIds.length);}
  await api.storage.local.set({draft:{sessionId:currentSession,plan},draftRevision:crypto.randomUUID()});
 }
 return entry;
}
