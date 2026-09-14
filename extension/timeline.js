import {analysisURL,domain,pageURL} from './core.js';

// Display grouping only. The raw events and clustering sessions are unchanged.
export function timelineSessions(events){
 const result=[];let current,pending=[];
 for(const e of [...events].sort((a,b)=>a.ts-b.ts)){
  if(['blur','idle','pause'].includes(e.type)){pending.push(e);continue;}
  if(!['activate','focus','navigate'].includes(e.type)||!e.url)continue;
  const hard=pending.find(p=>p.type==='idle'||p.type==='pause'),blur=pending.find(p=>p.type==='blur');
  let reason;
  if(!current)reason='记录从这里开始';
  else if(e.sessionId!==current.sessionId)reason='新的浏览器会话';
  else if(new Date(e.ts).toDateString()!==new Date(current.end).toDateString())reason='新的一天';
  else if(hard)reason=hard.type==='idle'?'电脑空闲或锁屏后继续':'记录暂停或整理操作后继续';
  else if(e.ts-current.end>15*60000)reason='超过 15 分钟没有新的访问记录';
  else if(blur&&e.ts-blur.ts>60000)reason='离开 Chrome 超过 1 分钟后回来';
  if(reason){current={id:`${e.sessionId}-${e.ts}`,start:e.ts,end:e.ts,sessionId:e.sessionId,reason,visits:[],windowIds:[],urls:[]};result.push(current);}
  else if(blur){current.visits.push({kind:'break',ts:blur.ts,returnAt:e.ts,text:'短暂离开 Chrome 后回来'});}
  const last=current.visits.at(-1);
  // Two foreground signals for the same activation should not become two visits.
  if(last?.kind==='visit'&&last.tabId===e.tabId&&last.url===e.url&&last.windowId===e.windowId&&e.ts-last.lastTs<=2000){last.lastTs=e.ts;last.signals++;if(e.title)last.title=e.title;}
  else {const returned=current.visits.some(v=>v.kind==='visit'&&v.url===e.url);current.visits.push({...e,kind:'visit',lastTs:e.ts,signals:1,returned});}
  current.end=e.ts;if(!current.windowIds.includes(e.windowId))current.windowIds.push(e.windowId);if(!current.urls.includes(e.url))current.urls.push(e.url);pending=[];
 }
 return result;
}
export function timelineContext(event,tabs,groups,sessionId){
 const url=analysisURL(event.url),matches=tabs.filter(t=>analysisURL(pageURL(t))===url);
 const exact=event.sessionId===sessionId?matches.find(t=>t.id===event.tabId):null;
 const candidates=exact?[exact]:matches;
 const assigned=groups.filter(g=>candidates.some(t=>g.tabIds.includes(t.id)));
 const group=assigned.length===1&&!assigned[0].uncertain&&!/^(待|新增待)/.test(assigned[0].name)?assigned[0]:null;
 return {group,tab:exact||matches[0]||null,site:domain(event.url),historical:matches.length===0};
}
export function timelineTitle(value,url){
 const title=String(value||'').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').trim();
 return title||domain(url);
}
