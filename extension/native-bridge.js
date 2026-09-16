import {analysisContext,reconcilePlan,fingerprint,validatePlan,COLORS,preserveManualGroups} from './core.js';
import {buildTrails} from './insights.js';
import {agentRequest} from './agent-api.js';
export const NATIVE_HOST='com.pagefold.bridge';
let port,handler,connecting=false,chain=Promise.resolve();
const state={connected:false,error:null};
let job;
const setAnalysis=analysis=>chrome.storage.session.set({analysis});
export function bridgeStatus(){return {...state};}
export async function connectBridge(dispatch) {
 handler=dispatch||handler;
 if(!handler||port||connecting)return;
 connecting=true;
 const {bridgeEnabled}=await chrome.storage.local.get('bridgeEnabled');
 if(bridgeEnabled===false){connecting=false;return;}
 try {
  const p=chrome.runtime.connectNative(NATIVE_HOST);port=p;
  p.onMessage.addListener(message=>{
   if(message.type==='ready'){state.connected=true;state.error=null;return;}
   if(message.type==='analysis_progress'){if(job?.id===message.id)setAnalysis({id:job.id,status:'running',startedAt:job.startedAt,text:message.text});return;}
   if(message.type==='analysis_result'){finishAnalysis(message).catch(error=>failAnalysis(message.id,error.message));return;}
   if(message.type!=='request'||typeof message.id!=='string')return;
   chain=chain.then(async()=>{
    if(port!==p)return; // Never replay a disconnected request after reconnecting.
    try {const data=await agentRequest(message.method,message.params,handler);if(port===p)p.postMessage({type:'response',id:message.id,ok:true,data});}
    catch(error){if(port===p)p.postMessage({type:'response',id:message.id,ok:false,error:error.message});}
   }).catch(error=>{state.error=error.message;});
  });
  p.onDisconnect.addListener(()=>{const err=chrome.runtime.lastError;if(port===p)port=null;if(job)failAnalysis(job.id,'本机连接中断，原分类已保留。');state.connected=false;state.error=err?.message||'本机连接已断开';chrome.alarms.create('pagefold-bridge-retry',{delayInMinutes:1});});
 }catch(error){state.error=error.message;}finally{connecting=false;}
}
export async function setBridgeEnabled(value){await chrome.storage.local.set({bridgeEnabled:!!value});if(!value){const p=port;port=null;p?.disconnect();state.connected=false;await chrome.alarms.clear('pagefold-bridge-retry');}else await connectBridge();return bridgeStatus();}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='pagefold-bridge-retry')connectBridge();});

async function failAnalysis(id,text) {if(job?.id!==id)return;job=null;await setAnalysis({id,status:'error',text,finishedAt:Date.now()});}
export async function analysisStatus(){
 const {analysis}=await chrome.storage.session.get('analysis');
 if(analysis?.status==='running'&&!job){const next={...analysis,status:'error',text:'上次分析已中断，请重新更新分类。'};await setAnalysis(next);return next;}
 return analysis||{status:'idle'};
}
export async function startAnalysis(){
 if(job)return analysisStatus();
 if(!port||!state.connected)throw Error('拾页本机服务未就绪，请到 设置 → 连接 Codex检查连接。');
 const current={id:crypto.randomUUID(),startedAt:Date.now()};job=current;
 try{
  const s=await handler({type:'state'});if(s.busy)throw Error('正在整理窗口，请稍后分析。');
  const {draftRevision,projectsRevision}=await chrome.storage.local.get(['draftRevision','projectsRevision']);
  Object.assign(current,{tabs:s.tabs,sessionId:s.sessionId,draftRevision,projectsRevision,projects:s.projects,source:s.analysisSource||'foreground',trails:buildTrails(s.events,s.historyImport,s.analysisSource||'foreground'),previous:s.draft?.plan});
  const analysis={id:current.id,status:'running',startedAt:current.startedAt,text:'正在连接模型 API…'};
  await setAnalysis(analysis);port.postMessage({type:'analyze_start',id:current.id,context:{...analysisContext(s.tabs,[],s.draft?.plan),projects:current.projects,trails:current.trails}});return analysis;
 }catch(error){await failAnalysis(current.id,error.message);throw error;}
}
export async function cancelAnalysis(){if(job){const id=job.id;job=null;port?.postMessage({type:'analyze_cancel',id});await setAnalysis({id,status:'cancelled',text:'已取消，保留原分类。'});}return analysisStatus();}
async function finishAnalysis(message){
 const current=job;if(!current||message.id!==current.id)return;
 if(!message.ok)throw Error(message.error||'分析失败，原分类已保留。');
 const result={version:1,source:'agent',provider:'api',model:message.result.model,createdAt:Date.now(),fingerprint:fingerprint(current.tabs),closeIds:[],groups:message.result.groups.map((g,i)=>({...g,id:'codex-'+(i+1),color:g.color||COLORS[i%COLORS.length]}))};
 validatePlan(result,current.tabs);
 result.groups=preserveManualGroups(result.groups,current.previous,current.tabs).map((g,i)=>({...g,id:'ai-'+(i+1)}));
 validatePlan(result,current.tabs);
 const s=await handler({type:'state'}),{draftRevision,projectsRevision}=await chrome.storage.local.get(['draftRevision','projectsRevision']);
 if(job!==current)return;
 if(s.sessionId!==current.sessionId||s.busy)throw Error('浏览器状态已变化，请重新更新分类。');
 if(projectsRevision!==current.projectsRevision)throw Error('常用项目已修改，请使用新标签重新分析。');
 if(draftRevision!==current.draftRevision)throw Error('你在分析期间修改了方案，已保留你的调整；请再次更新分类。');
 const plan=reconcilePlan(result,s.tabs);
 if(job!==current)return;
 const report={id:current.id,at:Date.now(),model:message.result.model,summary:message.result.summary||'已更新当前页面分类。',groups:structuredClone(plan.groups),projects:current.projects,activities:message.result.activities||[],scope:{tabCount:current.tabs.filter(t=>!t.pinned).length,trailCount:current.trails.length,visitCount:current.trails.reduce((n,t)=>n+t.visits.length,0)},source:current.source};
 const reports=[report,...(s.analysisReports||[])].slice(0,5);while(reports.length>1&&JSON.stringify(reports).length>500000)reports.pop();
 await chrome.storage.local.set({draft:{sessionId:s.sessionId,plan},analysisReports:reports});
 await chrome.storage.session.remove('agentPlan');
 job=null;await setAnalysis({id:current.id,status:'done',finishedAt:Date.now(),text:'分类已更新 · '+plan.groups.length+' 个工作空间 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),groupCount:plan.groups.length});
}
