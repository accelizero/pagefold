import {timelineSessions} from './timeline.js';
import {analysisURL} from './core.js';
export const defaultProjects=[
 {id:'social',name:'社媒调研',description:'社交媒体上的模型案例、产品展示与传播方式研究',children:['案例收集','内容与传播']},
 {id:'evaluation',name:'评测研究',description:'模型能力、基准设计、验证方法与评测结果分析',children:['基准与方法','结果分析']},
 {id:'papers',name:'论文阅读',description:'论文的阅读与整理；可以同时关联社媒调研或评测研究，不强制互斥',children:['方法与结论','相关工作']}
];
export function validateProjects(value){
 if(!Array.isArray(value)||value.length>40)throw Error('最多保存 40 个常用项目。');
 const seen=new Set();
 return value.map(p=>{if(!p||typeof p.id!=='string'||!/^[\w-]{1,80}$/.test(p.id)||seen.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>60||typeof p.description!=='string'||p.description.length>1000||!Array.isArray(p.children)||p.children.length>20||p.children.some(c=>typeof c!=='string'||!c.trim()||c.length>60))throw Error('项目需要名称、说明及有效的细分标签。');seen.add(p.id);return {id:p.id,name:p.name.trim(),description:p.description.trim(),children:[...new Set(p.children.map(c=>c.trim()))]};});
}
export function buildTrails(events=[],historyImport,source='foreground'){
 let trails=[];
 if(source!=='history')trails=timelineSessions(events).map(s=>({id:s.id,source:'foreground',reason:s.reason,visits:s.visits.filter(v=>v.kind==='visit')}));
 if(source!=='foreground'){
  let current;
  for(const v of [...(historyImport?.visits||[])].sort((a,b)=>a.ts-b.ts)){
   if(!current||v.ts-current.visits.at(-1).ts>15*60000||new Date(v.ts).toDateString()!==new Date(current.visits[0].ts).toDateString()){current={id:'history-'+v.visitId,source:'history',reason:'Chrome 历史按 15 分钟间隔分段；不包含仅切换已有标签的行为',visits:[]};trails.push(current);}
   current.visits.push(v);
  }
 }
 // Preserve order and repetitions, and state the scope of truncated segments.
 let budget=300;const selected=[];
 for(const t of trails.sort((a,b)=>b.visits.at(-1).ts-a.visits.at(-1).ts).slice(0,20)){
  if(!budget)break;const count=Math.min(t.visits.length,budget,60),visits=t.visits.slice(-count).map(v=>({ts:v.ts,title:String(v.title||'').slice(0,500).replace(/https?:\/\/[^\s]+/g,analysisURL),url:analysisURL(v.url),...(v.visitId?{visitId:v.visitId,referringVisitId:v.referringVisitId,transition:v.transition}:{})}));
  selected.push({...t,truncated:count<t.visits.length,visits});budget-=count;
 }
 return selected;
}
export function validateActivities(value,trails,projects){
 const allowed=new Map(projects.map(p=>[p.id,p]));
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==trails.length)throw Error('模型遗漏了浏览活动，原分析已保留。');
 return trails.flatMap(t=>{
  const parts=value[t.id];if(!Array.isArray(parts)||!parts.length)throw Error('模型遗漏了浏览轨迹。');let next=0;
  const result=parts.map((p,i)=>{
   if(!p||p.start!==next||!Number.isInteger(p.end)||p.end<p.start||p.end>=t.visits.length||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||typeof p.reason!=='string'||!Array.isArray(p.tags)||p.tags.length>20)throw Error('模型轨迹分段不完整或顺序错误。');
   for(const tag of p.tags)if(!allowed.has(tag.projectId)||(tag.topic!==''&&!allowed.get(tag.projectId).children.includes(tag.topic)))throw Error('模型引用了不存在的项目标签。');
   next=p.end+1;return {id:t.id+'-'+i,trailId:t.id,name:p.name,reason:p.reason.slice(0,500),tags:p.tags,source:t.source,truncated:t.truncated,visits:t.visits.slice(p.start,p.end+1)};
  });if(next!==t.visits.length)throw Error('模型遗漏了轨迹中的访问。');return result;
 });
}
export function coUsage(trails){
 const pairs=new Map();
 for(const t of trails){const seen=new Set();for(let i=1;i<t.visits.length;i++){const a=t.visits[i-1],b=t.visits[i];if(a.url===b.url)continue;const key=[a.url,b.url].sort().join('\n');if(seen.has(key))continue;seen.add(key);const pair=pairs.get(key)||{a,b,count:0};pair.count++;pairs.set(key,pair);}}
 return [...pairs.values()].sort((a,b)=>b.count-a.count).slice(0,8);
}
export function removeSpace(plan,id,tabs){
 const group=plan.groups.find(g=>g.id===id);if(!group||id==='unassigned')throw Error('这个工作空间无法移除。');
 const archive={id:crypto.randomUUID(),at:Date.now(),group:structuredClone(group),members:group.tabIds.map(id=>({id,url:tabs.find(t=>t.id===id)?.url}))};
 const next=structuredClone(plan);next.groups=next.groups.filter(g=>g.id!==id);let dest=next.groups.find(g=>g.id==='unassigned');
 if(!dest){dest={id:'unassigned',name:'未分配',color:'grey',tabIds:[],reason:'移除分类后的页面，仍然保留在 Chrome 中'};next.groups.push(dest);}dest.tabIds.push(...group.tabIds);dest.lockedIds=[...new Set([...(dest.lockedIds||[]),...group.tabIds])];next.source='manual';return {plan:next,archive};
}
export function restoreSpace(plan,archive,tabs){
 const next=structuredClone(plan),ids=archive.members.filter(m=>tabs.some(t=>t.id===m.id&&t.url===m.url&&!t.pinned)).map(m=>m.id);
 if(!ids.length)throw Error('原页面已关闭或导航，没有可恢复的归属。');
 for(const g of next.groups){g.tabIds=g.tabIds.filter(id=>!ids.includes(id));g.lockedIds=(g.lockedIds||[]).filter(id=>!ids.includes(id));}
 next.groups=next.groups.filter(g=>g.tabIds.length);next.groups.push({...archive.group,id:crypto.randomUUID(),tabIds:ids,lockedIds:ids});next.source='manual';return next;
}
