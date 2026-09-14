import {manageable, movable, pageURL, validatePlan} from './core.js';

export async function capture(api, sessionId) {
  const windows=(await api.windows.getAll({populate:true, windowTypes:['normal']})).filter(w=>!w.incognito);
  const groups=await api.tabGroups.query({});
  return {at:Date.now(), sessionId, windows:windows.map(w=>({id:w.id, focused:w.focused, state:w.state, left:w.left, top:w.top, width:w.width, height:w.height, tabs:w.tabs.filter(manageable).map(t=>({id:t.id,url:pageURL(t),title:t.title,index:t.index,pinned:t.pinned,active:t.active,groupId:t.groupId,windowId:t.windowId}))})),groups:groups.filter(g=>windows.some(w=>w.id===g.windowId))};
}
export async function applyPlan(api,plan,sessionId) {
  const before=await capture(api,sessionId);
  const current=(await api.tabs.query({windowType:'normal'})).filter(manageable);
  validatePlan(plan,current);
  const previous=(await api.storage.local.get('transaction')).transaction;
  if(previous && ['applying','restoring','failed'].includes(previous.status)) throw Error('上次操作尚未恢复，请先处理恢复记录。');
  const tx={id:crypto.randomUUID(),before,status:'applying',closedIds:[],closingIds:[],restoredIds:{},createdWindows:[],plan,startedAt:Date.now()};
  const save=()=>api.storage.local.set({transaction:tx});
  await save();
  try {
    // Close confirmed duplicates first, before moving other tabs can activate a leftover duplicate.
    for(const id of plan.closeIds) {
      const tab=await api.tabs.get(id), original=current.find(t=>t.id===id);
      const live=await api.tabs.query({windowType:'normal'});
      if(tab.pinned || tab.active || tab.audible || pageURL(tab)!==pageURL(original) || !live.some(t=>t.id!==id && !plan.closeIds.includes(t.id) && pageURL(t)===pageURL(tab))) throw Error('重复项状态已变化，已停止关闭。可以恢复刚才的整理。');
      tx.closingIds.push(id); await save();
      await api.tabs.remove(id); tx.closedIds.push(id); await save();
    }
    // Move existing live pages; never reload or reopen a page during organization.
    for(const g of plan.groups) {
      const ids=g.tabIds.filter(id=>!plan.closeIds.includes(id));
      if(!ids.length) continue;
      const w=await api.windows.create({tabId:ids[0],focused:false});
      tx.createdWindows.push(w.id); await save();
      for(let i=1;i<ids.length;i++) await api.tabs.move(ids[i],{windowId:w.id,index:-1});
      const groupId=await api.tabs.group({tabIds:ids,createProperties:{windowId:w.id}});
      await api.tabGroups.update(groupId,{title:g.name,color:g.color,collapsed:false});
    }
    tx.status='applied'; tx.finishedAt=Date.now(); await save();
    return tx;
  } catch(error) { tx.status='failed';tx.error=error.message;await save();throw Error(`整理未完成：${error.message} 已保留原始布局，请使用恢复。`); }
}

export async function restore(api,sessionId) {
  const tx=(await api.storage.local.get('transaction')).transaction;
  if(!tx || tx.status==='restored') throw Error('没有可恢复的操作。');
  if(tx.before.sessionId!==sessionId) throw Error('Chrome 已重启，旧的标签页编号已失效。请导出恢复记录，按网址手动恢复。');
  tx.status='restoring';tx.restoredIds ||= {};tx.restoreWindows ||= {};
  const save=()=>api.storage.local.set({transaction:tx}); await save();
  let skipped=0;
  try {
    for(const original of tx.before.windows) {
      const ids=[];
      for(const t of [...original.tabs].sort((a,b)=>a.index-b.index)) {
        let tab;
        try {tab=await api.tabs.get(tx.restoredIds[t.id] || t.id);} catch {}
        if(!tab && tx.closingIds.includes(t.id)) {
          // Only reopen pages this operation explicitly closed; never resurrect unrelated user closures.
          if(!/^https?:\/\//.test(t.url)) {skipped++;continue;}
          tab=await api.tabs.create({url:t.url,active:false});
          tx.restoredIds[t.id]=tab.id;await save();
        }
        if(tab) ids.push({tab,original:t}); else skipped++;
      }
      if(!ids.length) continue;
      let w;
      try {w=await api.windows.get(tx.restoreWindows[original.id] || original.id);} catch {}
      if(!w) {
        await api.tabs.update(ids[0].tab.id,{pinned:false});
        w=await api.windows.create({tabId:ids[0].tab.id,focused:false});
        tx.restoreWindows[original.id]=w.id;await save();
      }
      for(const {tab} of ids) {
        await api.tabs.update(tab.id,{pinned:false});
        await api.tabs.move(tab.id,{windowId:w.id,index:-1});
        await api.tabs.ungroup(tab.id);
      }
      for(let i=0;i<ids.length;i++) {
        const {tab,original:t}=ids[i];
        await api.tabs.move(tab.id,{windowId:w.id,index:t.index});
        if(t.pinned) await api.tabs.update(tab.id,{pinned:true});
      }
      for(const g of tx.before.groups.filter(g=>g.windowId===original.id)) {
        const tabIds=ids.filter(x=>x.original.groupId===g.id && !x.original.pinned).map(x=>x.tab.id);
        if(tabIds.length) {
          const groupId=await api.tabs.group({tabIds,createProperties:{windowId:w.id}});
          await api.tabGroups.update(groupId,{title:g.title,color:g.color,collapsed:g.collapsed});
        }
      }
      const active=ids.find(x=>x.original.active); if(active) await api.tabs.update(active.tab.id,{active:true});
      if(original.state==='normal') await api.windows.update(w.id,{state:'normal',left:original.left,top:original.top,width:original.width,height:original.height});
      else if(original.state) await api.windows.update(w.id,{state:original.state});
    }
    const focused=tx.before.windows.find(w=>w.focused);
    if(focused) { try {await api.windows.update(tx.restoreWindows[focused.id]||focused.id,{focused:true});} catch {} }
    tx.status='restored';tx.skipped=skipped;tx.restoredAt=Date.now();await save();return tx;
  } catch(error) {tx.status='failed';tx.error=error.message;await save();throw Error(`恢复中断：${error.message}。记录仍保留，可以重试。`);}
}
