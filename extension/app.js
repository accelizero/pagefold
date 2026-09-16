import {renderInsights,insightAction,insightChange,archivedSpaces,tagNames} from './insights-ui.js';
import {defaultProjects} from './insights.js';
import {timelineSessions,timelineContext,timelineTitle} from './timeline.js';
import {propose,duplicateSets,domain,pageURL,movable,fingerprint,sessions,agentPacket,validatePlan,COLORS,reconcilePlan} from './core.js';
import {demoState} from './demo.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const live=!!globalThis.chrome?.runtime?.id;
const labels={overview:'统计总览',analysis:'AI 分析',projects:'常用项目',spaces:'工作空间',timeline:'关联线索',windows:'当前窗口',duplicates:'重复候选',history:'恢复记录',settings:'设置'};
const icons=['⌑','✳','◇','◌','◈','▧'];
let pendingClose;
let analysis={status:'idle'};
const expandedTimeline=new Set();let timelineLimit=30;
let state,plan,view='spaces',query='',busy=false,stale=false;
let demo=demoState();
try {const saved=JSON.parse(localStorage.getItem('pagefold-demo'));if(!live && saved?.tabs && saved?.windows) demo=saved;}catch{}
async function api(type,data={}) {
 if(live) {const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok) throw Error(r?.error||'扩展后台未响应，请刷新重试。');return r.data;}
 if(type==='state') return structuredClone({...demo,projects:demo.projects||defaultProjects});
 if(type==='saveProjects')demo.projects=data.projects;
 if(type==='analysisSource')demo.analysisSource=data.value;
 if(type==='clearHistoryImport')delete demo.historyImport;
 if(type==='pause') demo.paused=data.value;
 if(type==='clearEvents') demo.events=[];
 if(type==='discardRecovery') delete demo.transaction;
 if(type==='focus') {toast('演示：已定位到「'+(state.tabs.find(t=>t.id===data.id)?.title||'页面')+'」');return;}
 if(type==='closeTab') {const t=demo.tabs.find(t=>t.id===data.id);if(!t||pageURL(t)!==data.expectedUrl)throw Error('页面已变化');demo.closedTabs=[...(demo.closedTabs||[]),{id:crypto.randomUUID(),tab:structuredClone(t),group:structuredClone(demo.draft?.plan?.groups.find(g=>g.tabIds.includes(t.id))||null)}].slice(-20);demo.tabs=demo.tabs.filter(t=>t.id!==data.id);demo.windows=demo.windows.map(w=>({...w,tabs:w.tabs.filter(t=>t.id!==data.id)}));}
 if(type==='reopenTab') {const entry=demo.closedTabs?.find(e=>e.id===data.id);if(!entry)throw Error('关闭记录已失效');const t={...entry.tab,id:Math.max(0,...demo.tabs.map(t=>t.id),...demo.closedTabs.map(e=>e.tab.id))+1};demo.tabs.push(t);let w=demo.windows.find(w=>w.id===t.windowId);if(w)w.tabs.push(t);else demo.windows.push({id:t.windowId,tabs:[t]});demo.closedTabs=demo.closedTabs.filter(e=>e.id!==data.id);if(demo.draft?.plan){const next=reconcilePlan(demo.draft.plan,demo.tabs);if(entry.group&&!t.pinned){next.groups.forEach(g=>g.tabIds=g.tabIds.filter(id=>id!==t.id));let g=next.groups.find(g=>g.id===entry.group.id);if(!g){g={...entry.group,tabIds:[]};next.groups.push(g);}g.tabIds.push(t.id);next.groups=next.groups.filter(g=>g.tabIds.length);}demo.draft.plan=next;}}
 if(type==='apply') {
   validatePlan(data.plan,demo.tabs);
   const before=structuredClone(demo);
   const base=10;
   demo.tabs=demo.tabs.filter(t=>!data.plan.closeIds.includes(t.id));
   for(let i=0;i<data.plan.groups.length;i++) {
    const g=data.plan.groups[i];g.tabIds.forEach((id,index)=>{const t=demo.tabs.find(t=>t.id===id);if(t) Object.assign(t,{windowId:base+i,index,groupId:base+i});});
   }
   demo.windows=[...new Set(demo.tabs.map(t=>t.windowId))].map(id=>({id,tabs:demo.tabs.filter(t=>t.windowId===id)}));
   demo.transaction={id:'demo-operation',status:'applied',startedAt:Date.now(),before,plan:data.plan,closedIds:data.plan.closeIds};
 }
 if(type==='restore') {if(!demo.transaction) throw Error('没有可恢复记录。');const tx=demo.transaction;demo=structuredClone(tx.before);demo.transaction={...tx,status:'restored',restoredAt:Date.now()};}
 localStorage.setItem('pagefold-demo',JSON.stringify(demo));
 return demo.transaction;
}
async function actOnTab(type,data){busy=true;render();try{await api(type,data);if(type==='reopenTab')toast('已重新打开页面');}finally{busy=false;await refresh();}}
function toast(text) {$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function error(e) {toast(e.message||String(e));}
function showNotice(text) {$('#notice').textContent=text;$('#notice').classList.toggle('hidden',!text);}
function fmtTime(ts) {return new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
function fmtDate(ts) {return new Date(ts).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function winName(id) {return '窗口 '+(state.windows.findIndex(w=>w.id===id)+1);}
function matches(t) {return !query || `${t.title} ${pageURL(t)}`.toLowerCase().includes(query.toLowerCase());}
function download(name,value) {const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function saveDraft(userEdit=false) {
 const draft={sessionId:state.sessionId,plan};
 if(live) await chrome.storage.local.set({draft,...(userEdit?{draftRevision:crypto.randomUUID()}:{})});
 else {demo.draft=structuredClone(draft);localStorage.setItem('pagefold-demo',JSON.stringify(demo));}
}
async function refresh(reset=false) {
 state=await api('state');
 if(live)analysis=await api('analyzeStatus');
 let candidate=reset?null:(state.draft?.plan||plan);
 if(candidate){try{validatePlan(candidate,state.tabs);}catch{try{candidate=reconcilePlan(candidate,state.tabs);}catch{candidate=null;}}}
 plan=candidate||propose(state.tabs,state.events);stale=false;
 if(JSON.stringify(state.draft?.plan)!==JSON.stringify(plan))await saveDraft();
 render();
}

function render() {
 $('main').classList.toggle('timeline-view',view==='timeline');
 $('main').classList.toggle('insights-view',['analysis','overview','projects'].includes(view));
 $('#stats').classList.toggle('hidden',['timeline','analysis','projects'].includes(view));
 $('.toolbar-actions').classList.toggle('hidden',view==='timeline');
 $('.analysis-line').classList.toggle('hidden',view==='timeline');
 $$('#modal button').forEach(b=>b.disabled=busy);
 $('#mode-badge').textContent=live?(state.paused?'记录已暂停':'本地记录中'):'DEMO · 可交互';
 $('#demo-banner').classList.toggle('hidden',live);
 $('#space-count').textContent=plan.groups.length;
 const d=duplicateSets(state.tabs),count=d.exact.reduce((n,a)=>n+a.length-1,0);

 $('#view-label').textContent=labels[view];
 const parent=['spaces','overview','windows','duplicates','history'].includes(view)?'spaces':view==='timeline'?'analysis':view;
 $('#mobile-nav').value=parent;
 $$('[data-view]').forEach(b=>{const active=b.dataset.view===(b.closest('.sidebar')?parent:view);b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 $('#context-nav').innerHTML=parent==='spaces'?'<div class="context-row"><div class="context-tabs"><button data-view="spaces" class="'+(view==='spaces'?'active':'')+'">页面</button><button data-view="overview" class="'+(view==='overview'?'active':'')+'">统计</button></div><details class="context-more"><summary>更多整理工具</summary><div><button data-view="windows">查看 Chrome 窗口</button><button data-view="duplicates">检查重复页面'+(count?' · '+count:'')+'</button><button data-view="history">恢复整理前的布局</button></div></details></div>':view==='analysis'?'<div class="context-row secondary-context"><span>分析结果与每次浏览路径，都在这里。</span><button class="text-button" data-view="timeline">查看关联线索</button></div>':view==='timeline'?'<button class="button secondary" data-view="analysis">← 返回 AI 分析</button>':'';
 $('.workspace-toolbar').classList.toggle('hidden',['projects','settings','overview','history'].includes(view));
 $('#preview').classList.toggle('hidden',!['spaces','windows','duplicates'].includes(view));
 $('.analysis-line').classList.toggle('hidden',!['spaces','analysis','windows','duplicates'].includes(view));
 $('#stats').classList.toggle('hidden',parent!=='spaces');
 if(parent!==view)$('#view-label').textContent=labels[parent]+' / '+labels[view];
 const heads={overview:['页面有多少，<br>思路在哪里。','看项目分布与共同访问关系。'],analysis:['同一件事，<br>每次都有来路。','AI 理解项目，同时保留每次不同的浏览路径。'],projects:['你常做的事，<br>给 AI 一点方向。','定义项目、用途和细分；允许一段活动属于多个项目。'],spaces:['散落的页面，<br>接得上的思路。','跨过窗口的边界，把一起做的事放在一起。'],timeline:['页面之间，<br>有哪些关联。','这是用于判断共同访问的原始线索，分析结果在 AI 分析页。'],windows:['所有窗口，<br>在一个地方看见。','搜索任意页面，直接回到它所在的窗口。'],duplicates:['少一些重复，<br>多一点空间。','逐项确认需要关闭的副本，整理时再统一执行。'],history:['每次整理，<br>都有一条回来的路。','恢复最近一次操作前的窗口、顺序与标签组。'],settings:['你的记录，<br>由你来掌握。','选择用于判断页面关联的线索，随时暂停或清除。']};
 $('#hero-title').innerHTML=heads[view][0];$('#hero-subtitle').textContent=heads[view][1];
 const sessionCount=sessions(state.events).length;
 $('#stats').innerHTML=[['打开的标签页',state.tabs.length,'个页面'],['分散在',state.windows.filter(w=>w.tabs.length).length,'个窗口'],['建议工作空间',plan.groups.length,'个上下文'],['完全重复副本',count,'个待确认']].map(([label,n,unit])=>`<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${n}<small>${unit}</small></span></div>`).join('');
 const closed=state.closedTabs?.at(-1);$('#close-status').classList.toggle('hidden',!closed);$('#close-status').innerHTML=closed?'<div><b>已关闭：'+esc(closed.tab.title||closed.tab.url)+'</b><small>撤销会重新打开网址，未保存内容无法恢复。</small></div><button class="button secondary" data-reopen-tab="'+esc(closed.id)+'">撤销关闭'+(state.closedTabs.length>1?' · '+state.closedTabs.length:'')+'</button>':'';
 $('#preview').disabled=busy || stale || !state.tabs.some(movable);
 if($('#regenerate'))$('#regenerate').disabled=busy||analysis.status==='running';
 $('#analyze').disabled=busy||analysis.status==='running';
 $('#analyze').textContent=analysis.status==='running'?'AI 正在分析…':'✳ AI 分析并更新';
 $('#cancel-analysis').classList.toggle('hidden',analysis.status!=='running');
 const status=$('#analysis-status');status.textContent=analysis.text||(plan.source==='agent'?'上次分析 · '+fmtDate(plan.createdAt):'点击更新分类，让模型按项目理解这些页面。');
 status.classList.toggle('error',analysis.status==='error');
 showNotice(stale?'页面已变化，请刷新工作台后继续。':state.transaction && ['failed','applying','restoring'].includes(state.transaction.status)?'上次操作未完成，原始布局已保存。请到“恢复记录”处理后再整理。':'');
 const renderers={overview:()=>renderInsights('overview',state,plan,query),analysis:()=>renderInsights('analysis',state,plan,query),projects:()=>renderInsights('projects',state,plan,query),spaces:renderSpaces,timeline:renderTimeline,windows:renderWindows,duplicates:renderDuplicates,history:renderHistory,settings:renderSettings};
 $('#content').innerHTML=renderers[view]();
}
function tabRow(t,{editable=false,closable=true}={}) {
 const letter=domain(pageURL(t)).slice(0,1).toUpperCase();
 return `<div class="tab-row"><span class="favicon" aria-hidden="true">${esc(letter)}</span><button class="tab-link" data-focus="${t.id}" title="${esc(pageURL(t))}"><strong>${esc(t.title||'未命名标签页')}</strong><small>${esc(domain(pageURL(t)))}</small></button><span class="tab-meta">${t.pinned?'固定':t.audible?'播放中':winName(t.windowId)}</span>${editable?`<select class="move-select" data-move="${t.id}" aria-label="调整 ${esc(t.title)} 的归属">${plan.groups.map(g=>`<option value="${esc(g.id)}" ${g.tabIds.includes(t.id)?'selected':''}>${esc(g.name)}</option>`).join('')}</select>`:''}${closable?`<button class="close-tab" data-close-tab="${t.id}" title="关闭页面；未保存内容可能丢失" aria-label="关闭页面 ${esc(t.title||pageURL(t))}" ${busy?'disabled':''}>×</button>`:''}</div>`;
}
function renderSpaces() {
 const groups=plan.groups.map((g,i)=>({...g,i,tabs:g.tabIds.map(id=>state.tabs.find(t=>t.id===id)).filter(Boolean).filter(matches)})).filter(g=>g.tabs.length);
 return `<div class="section-heading"><h2>你的工作上下文 <span class="dot">·</span> ${groups.length}</h2><p>${plan.source==='agent'?(plan.provider==='api'?'模型语义分类':'Codex 语义分类'):plan.source==='manual'?'你的调整':'本地初步分组'} · 名称可编辑，页面可调整归属</p><button class="add-space" id="add-space">＋ 新空间</button></div><div class="space-grid">${groups.map(g=>`<article class="space-card ${g.color}"><div class="card-head"><div class="space-icon">${icons[g.i%icons.length]}</div><div class="card-title"><input data-rename="${esc(g.id)}" aria-label="工作空间名称 ${esc(g.name)}" value="${esc(g.name)}" maxlength="60"><small>${g.uncertain?'等待你的判断':esc(g.reason||'你调整的工作空间')}</small></div><span class="count">${g.tabs.length}</span></div><div class="workspace-tags">${tagNames(g.tags,state.projects||defaultProjects).map(n=>`<span class="pill">${esc(n)}</span>`).join(" ")}</div><div class="tab-list">${g.tabs.map(t=>tabRow(t,{editable:true})).join('')}</div><div class="card-foot"><span>来自 ${new Set(g.tabs.map(t=>t.windowId)).size} 个窗口</span>${g.id!=='unassigned'?`<button class="text-button" data-space-remove="${esc(g.id)}">移除工作空间</button>`:'<span>页面保留，可重新分配</span>'}</div></article>`).join('')}</div>${archivedSpaces(state)}${!groups.length?empty('没有匹配的页面','试试其他关键词，或打开几个标签页后刷新。'):''}<div class="protected"><b>⌑ 固定页面 · ${state.tabs.filter(t=>t.pinned).length}</b><span>留在原窗口</span>${state.tabs.filter(t=>t.pinned && matches(t)).map(t=>tabRow(t)).join('')}</div>`;
}
function empty(title,text) {return `<div class="empty"><h3>${title}</h3><p>${text}</p></div>`;}
function renderTimeline() {
 const clock=ts=>new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 const all=timelineSessions(state.events).filter(s=>!query||s.visits.some(e=>e.kind==='visit'&&matches(e))).reverse(),shown=all.slice(0,timelineLimit);
 const row=e=>{
  if(e.kind==='break')return '<li class="visit-break"><span>↳</span>短暂离开 Chrome · '+Math.max(1,Math.round((e.returnAt-e.ts)/1000))+' 秒后回来</li>';
  const ctx=timelineContext(e,state.tabs,plan.groups,state.sessionId),title=timelineTitle(e.title,e.url),short=title.length>120?title.slice(0,120)+'…':title;
  const action=e.returned?'再次回到':e.type==='navigate'?'打开页面':e.type==='focus'?'回到 Chrome':'切换到';
  return '<li class="visit-row '+(ctx.group?.color||'grey')+'"><time>'+clock(e.ts)+'</time><span class="visit-node" aria-hidden="true"></span><div class="visit-content"><div class="visit-heading"><span class="visit-action">'+action+'</span>'+(ctx.group?'<span class="visit-project">'+esc(ctx.group.name)+'</span>':'')+'</div>'+(ctx.tab?'<button class="visit-title" data-focus="'+ctx.tab.id+'" title="'+esc(title)+'">'+esc(short)+'</button>':'<div class="visit-title" title="'+esc(title)+'">'+esc(short)+'</div>')+'<div class="visit-meta"><span>'+esc(ctx.site)+'</span><span>'+(ctx.tab?'点击标题回到页面':'历史记录 · 当前未找到该页面')+'</span></div></div></li>';
 };
 return '<div class="section-heading"><h2>你的访问顺序</h2><p class="recording">'+(state.paused?'已暂停':'自动记录')+' · 最近 30 天</p></div><div class="timeline-guide"><b>先看了什么，后来又去了哪里</b><p>最新时段在上；每段内从上到下，按实际访问顺序排列。时间表示切换到页面的时刻，不是停留时长。项目名称按当前分类标注。</p><small>短暂离开 Chrome 不再拆成新卡片；空闲、暂停或较长间隔会另起一段，并注明原因。</small></div>'+shown.map(s=>{
  const visits=s.visits.filter(e=>e.kind==='visit'),contexts=visits.map(e=>timelineContext(e,state.tabs,plan.groups,state.sessionId));
  const names=[...new Set(contexts.map(c=>c.group?.name).filter(Boolean))],sites=[...new Set(contexts.map(c=>c.site))];
  const title=names.length?names.slice(0,2).join(' / ')+(names.length>2?' 等 '+names.length+' 个项目':''):'浏览 '+sites.slice(0,2).join('、')+(sites.length>2?' 等网站':'');
  const date=new Date(s.start).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'}),rows=s.visits;
  let cut=0,visible=0;while(cut<rows.length&&visible<5){if(rows[cut].kind==='visit')visible++;cut++;}
  const more=rows.slice(cut),open=expandedTimeline.has(s.id)||!!query;
  return '<article class="session readable-session"><div class="session-time">'+fmtTime(s.start)+'<small>'+date+'</small></div><div class="session-body"><div class="timeline-session-head"><h3>'+esc(title)+'</h3><span>'+visits.length+' 次访问 · '+s.urls.length+' 个页面</span></div><p class="timeline-range">'+clock(s.start)+(s.end!==s.start?' — '+clock(s.end):' · 单次记录')+' · '+(s.windowIds.length>1?'涉及 '+s.windowIds.length+' 个窗口':'在 1 个窗口中')+'</p><div class="session-reason">'+esc(s.reason)+'</div><ol class="visit-list">'+rows.slice(0,cut).map(row).join('')+'</ol>'+(more.length?'<details class="more-visits" data-timeline-expand="'+esc(s.id)+'" '+(open?'open':'')+'><summary><span class="expand-visits">展开其余 '+more.filter(e=>e.kind==='visit').length+' 次访问</span><span class="collapse-visits">收起后续访问</span></summary><ol class="visit-list">'+more.map(row).join('')+'</ol></details>':'')+'</div></article>';
 }).join('')+(all.length>shown.length?'<button id="more-timeline" class="button secondary">查看更早的访问 · 还有 '+(all.length-shown.length)+' 段</button>':'')+(!all.length?empty(query?'没有匹配的访问记录':'时间线从现在开始',query?'试试页面标题或网址关键词。':'可以记录切换线索，或在 AI 分析页按需导入 Chrome 历史。'): '');
}

function renderWindows() {
 return `<div class="section-heading"><h2>Chrome 当前布局</h2><p>点击页面，跨窗口定位</p></div><div class="space-grid">${state.windows.filter(w=>w.tabs.some(matches)).map((w,i)=>`<article class="space-card ${COLORS[i%8]}"><div class="card-head"><span class="space-icon">▣</span><div class="card-title"><b>${winName(w.id)}</b><small>${w.focused?'当前前台窗口':'已打开的窗口'}</small></div><span class="count">${w.tabs.length}</span></div><div class="tab-list">${w.tabs.filter(matches).map(t=>tabRow(t)).join('')}</div></article>`).join('')}</div>`;
}
function renderDuplicates() {
 const d=duplicateSets(state.tabs);
 return `<div class="section-heading"><h2>完全相同的网址 · ${d.exact.length} 组</h2><p>已选关闭 ${plan.closeIds.length} 个 · 应用方案时执行</p></div><div class="timeline-summary">所有副本默认保留。勾选要关闭的页面后，再预览整理方案。活动、固定和正在播放声音的标签页受保护。<br>关闭后的恢复会重新打开网址，无法恢复未提交的表单、滚动位置或页面内状态。</div>${d.exact.filter(a=>a.some(matches)).map(a=>`<div class="list-card"><h3>${esc(a[0].title)} <span class="pill">网址完全相同</span></h3><code>${esc(pageURL(a[0]))}</code>${a.map(t=>{const disabled=t.pinned||t.active||t.audible;return `<label class="dup-row"><input type="checkbox" data-close="${t.id}" aria-label="关闭副本 ${esc(t.title)} ${winName(t.windowId)}" ${plan.closeIds.includes(t.id)?'checked':''} ${disabled?'disabled':''}>${tabRow(t,{closable:false})}<span class="pill">${disabled?'受保护':'可关闭'}</span></label>`;}).join('')}</div>`).join('')}${!d.exact.length?empty('没有完全重复的网址','当前打开的页面各有其位置。'):''}<div class="section-heading"><h2>仅追踪参数不同 · ${d.related.length} 组</h2><p>供你比较，暂不自动关闭</p></div>${d.related.filter(a=>a.some(matches)).map(a=>`<div class="list-card">${a.map(t=>tabRow(t)).join('')}<p>移除 utm_*、gclid、fbclid、msclkid 后网址一致；原网址、其他参数和锚点均保留。</p></div>`).join('')}`;
}
function renderHistory() {
 const tx=state.transaction;
 if(!tx) return empty('还没有整理记录','应用第一个方案后，这里会保存操作前的布局。只保留最近一次操作的恢复点。');
 const states={applied:'整理已完成',failed:'操作中断，可尝试恢复',applying:'整理尚未完成',restoring:'恢复尚未完成',restored:'已恢复'};
 const valid=(!live||tx.before.sessionId===state.sessionId) && tx.status!=='restored';
 return `<div class="list-card"><h3>↶ ${states[tx.status]||tx.status}</h3><p>${fmtDate(tx.startedAt)} · ${tx.plan.groups.filter(g=>g.tabIds.length).length} 个工作空间 · 关闭 ${tx.closedIds?.length||0} 个副本</p>${tx.error?`<p class="error">${esc(tx.error)}</p>`:''}<p>恢复会把仍然打开的原标签页移回原布局，并重新打开本次关闭的副本。你后来新开的页面会保留；你自己关闭的页面不会被重新打开。关闭过的页面内状态无法还原。只保留最近一次操作。</p>${live && tx.before.sessionId!==state.sessionId?'<p class="notice">Chrome 已重启，旧页面编号失效。请导出记录，按原网址找回页面。</p>':''}<div class="agent-actions"><button id="restore" class="button primary" ${!valid?'disabled':''}>恢复整理前的布局</button><button id="export-backup" class="button secondary">导出恢复记录</button>${tx.status!=='restored'?'<button id="discard-recovery" class="button secondary">结束恢复记录…</button>':''}</div></div>`;
}
function renderSettings() {
 return `<div class="list-card setting-row"><div><h3>连接 Codex</h3><p>让 Codex 读取页面、深入分析，或按你的要求整理。</p></div><button id="agent-button" class="button secondary">连接与协作设置</button></div><div class="list-card setting-row"><div><h3>记录共同访问的切换线索</h3><p>${state.events.length} 条本地事件 · 最近 30 天 · 最多 12,000 条 / 约 4 MB</p></div><button id="pause" class="button ${state.paused?'primary':'secondary'}">${state.paused?'继续记录':'暂停记录'}</button></div><div class="list-card"><h3>页面线索留在你的设备上</h3><p>自动记录前台页面的标题、网址、切换时间与窗口编号。切换线索不采集正文；不会读取表单值或无痕窗口。自动记录不调用模型服务，也不加载远程图标。点击“AI 分析并更新”时，会把标题、已过滤查询参数的网址、常用项目、最近最多 20 段 / 300 次所选访问路径和上次分类发送到你自行配置的模型服务，由所选模型分析，使用该服务的额度。默认不发送正文。Codex 本机连接开启时，可以按请求读取指定页面正文；输入框和可编辑草稿排除。网址、标题和正文仍可能包含私人信息。</p><p>通过 MCP 读取的材料会进入当前 Codex 对话，并按所使用的模型服务处理。你可在 设置 → 连接 Codex中停用本机连接，或继续手动导出文件。</p><div class="agent-actions"><button id="export-events" class="button secondary">导出时间线</button><button id="clear-events" class="button danger">清空时间线…</button></div></div><div class="list-card"><h3>当前版本 · 0.4.2</h3><p>主入口通过模型 API 分析项目与各次浏览活动；本地关键词建议作为备用。Codex 可通过 MCP 读取指定页面正文，直接提交、应用或恢复结构化方案，执行前校验全部标签页。</p><button id="help" class="button secondary">安装与使用说明 ↗</button>${!live?'<button id="reset-demo" class="button secondary">重置演示数据</button>':''}</div>`;
}
function modal(title,body,foot='') {$('#modal-content').innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="icon-button" data-dismiss aria-label="关闭对话框">×</button></div><div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:''}`;if(!$('#modal').open) $('#modal').showModal();}
function preview() {
 validatePlan(plan,state.tabs);
 const groups=plan.groups.filter(g=>g.tabIds.some(id=>!plan.closeIds.includes(id))),pinnedWindows=new Set(state.tabs.filter(t=>t.pinned).map(t=>t.windowId));
 modal('把方案看清楚，再整理。',`<div class="preview-summary"><div><b>${state.windows.filter(w=>w.tabs.length).length}</b><span>当前窗口</span></div><span>→</span><div><b>${groups.length}</b><span>新工作窗口</span></div><span>＋</span><div><b>${pinnedWindows.size}</b><span>含固定页的原窗口</span></div></div><p>将移动 ${state.tabs.filter(movable).length-plan.closeIds.length} 个现有页面，关闭 ${plan.closeIds.length} 个你选择的副本。固定页留在原位。只含扩展页面或其他排除页面的窗口可能另外保留。</p>${groups.map(g=>`<div class="preview-row"><b>${esc(g.name)}</b><small>${g.tabIds.filter(id=>!plan.closeIds.includes(id)).length} 个页面 → 新窗口 + 同名标签组</small></div>`).join('')}${plan.closeIds.length?`<h3>将关闭这些副本</h3>${plan.closeIds.map(id=>tabRow(state.tabs.find(t=>t.id===id),{closable:false})).join('')}<p class="notice">恢复关闭的副本会重新打开网址，不能还原页面内未保存状态。</p>`:''}<p>执行前保存原布局；如中途失败，可到恢复记录找回。应用新方案会替换上一次恢复点。</p><p id="apply-error" class="error hidden"></p>`,`<small>${live?'执行将重新排列你的 Chrome 窗口':'演示模式 · 不影响真实 Chrome'}</small><button id="apply" class="button primary">${live?'应用整理方案':'模拟应用方案'} ↗</button>`);
}
function agentDialog() {
 modal('让 Codex 接着你的思路工作。',`<div class="list-card"><h3>Codex 本机连接 · MCP</h3><p id="bridge-status">${live?'正在检查连接…':'演示模式：安装扩展和本机接口后可使用。'}</p><p>直接对 Codex 说“读一下我的标签页”或“按项目帮我整理”。无需手工复制材料。正文仅在你要求读取时提取。</p><div class="agent-actions"><button id="bridge-reconnect" class="button secondary">重连 / 检查</button><button id="bridge-toggle" class="button secondary">停用本机连接</button></div></div><h3>备用：本地建议</h3><p>无需模型，用关键词和时间线生成初步分组，会替换当前预览。</p><button id="regenerate" class="button secondary">生成本地建议</button><h3>也可以通过文件协作</h3><p>把当前标签和最近访问线索交给你正在使用的 Agent，让它重新判断归属。文件协作需要你手动提交；主页面的更新分类按钮则会调用配置的模型 API。</p><h3>1. 导出协作材料</h3><p>包含页面标题、完整网址及最近最多 1,500 条事件。检查内容后，把文件交给 Agent，要求它返回 JSON 方案。</p><div class="agent-actions"><button id="export-agent" class="button secondary">下载协作材料</button><button id="copy-agent" class="button secondary">复制协作材料</button></div><h3>2. 放回 Agent 的方案</h3><textarea id="agent-input" placeholder="粘贴 Agent 返回的 JSON 方案…" aria-label="Agent JSON 方案"></textarea><p id="agent-error" class="error hidden"></p>`,`<small>导入只更新预览，应用前仍由你确认。</small><button id="import-agent" class="button primary">校验并预览</button>`);
}
async function updateBridgeStatus() {
 const target=$('#bridge-status');if(!target||!live)return;
 try {const s=await api('bridgeStatus');target.textContent=s.connected?'已连接 · Codex 可以读取标签、时间线和指定页面正文':s.enabled?'等待连接 · 请先运行 npm run setup:mcp，再点击重连。'+(s.error?'（'+s.error+'）':''):'本机连接已停用';const b=$('#bridge-toggle');if(b){b.textContent=s.enabled?'停用本机连接':'启用本机连接';b.dataset.enabled=String(s.enabled);}}catch(e){target.textContent=e.message;}
}
function helpDialog() {
 modal('把拾页放进你的 Chrome。',`<p>1. 打开 <strong>chrome://extensions</strong>，启用右上角“开发者模式”。</p><p>2. 点击“加载已解压的扩展程序”，选择项目中的 <strong>extension</strong> 文件夹。</p><p>3. 点击工具栏里的“拾页”，即可读取真实窗口。也可用 <strong>⌥ Shift P</strong> 打开工作台，或从 Chrome 侧边栏选择拾页。</p><p>安装后才开始记录真实时间线。第一次整理可以先用标题与网址生成建议，等访问线索积累后再调整。</p><p>这个演示页使用示例数据。真实扩展运行时，顶部会显示“本地记录中”。</p>`);
}
document.addEventListener('click',async e=>{
 const target=e.target.closest('button');if(!target || busy) return;
 try {
  if(await insightAction(target,{state,plan,modal,api,refresh,live,toast,save:async(next,archivedGroups)=>{plan=next;const draft={sessionId:state.sessionId,plan};if(live)await chrome.storage.local.set({draft,archivedGroups,draftRevision:crypto.randomUUID()});else{demo.draft=structuredClone(draft);demo.archivedGroups=archivedGroups;localStorage.setItem('pagefold-demo',JSON.stringify(demo));}}}))return;
  if(target.dataset.closeTab){const t=state.tabs.find(t=>t.id===Number(target.dataset.closeTab));if(!t)throw Error('页面已关闭，请刷新。');if(t.pinned||t.audible){pendingClose={id:t.id,expectedUrl:pageURL(t),sessionId:state.sessionId};modal('关闭这个页面？','<p>'+esc(t.title)+'</p><p>这是'+(t.pinned?'固定页面':'正在播放声音的页面')+'。关闭后可以重新打开网址，但无法恢复未保存内容。</p>','<button id="confirm-close-tab" class="button danger">关闭页面</button>');}else await actOnTab('closeTab',{id:t.id,expectedUrl:pageURL(t),sessionId:state.sessionId});return;}
  if(target.id==='confirm-close-tab'){const request=pendingClose;pendingClose=null;$('#modal').close();if(request)await actOnTab('closeTab',{...request,confirmed:true});return;}
  if(target.dataset.reopenTab){await actOnTab('reopenTab',{id:target.dataset.reopenTab});return;}
  if(target.dataset.view) {view=target.dataset.view;query='';$('#search').value='';render();}
  if(target.dataset.focus) await api('focus',{id:Number(target.dataset.focus)});
  if(target.hasAttribute('data-dismiss')) $('#modal').close();
  switch(target.id) {
   case 'more-timeline':timelineLimit+=30;render();break;
   case 'analyze':
    if(!live){toast('这是示例数据。安装扩展后可通过模型 API 更新分类。');break;}
    analysis=await api('analyzeStart');render();break;
   case 'cancel-analysis':analysis=await api('analyzeCancel');render();break;
   case 'refresh': await refresh();toast('已刷新全部窗口');break;
   case 'regenerate':
    if(plan.source==='manual'||plan.source==='agent') modal('重新生成本地建议？','<p>这会替换当前的改名、页面归属和去重选择。浏览器布局不会改变。</p>','<button id="confirm-regenerate" class="button primary">替换当前方案</button>');
    else {await refresh(true);toast('已更新本地建议');} break;
   case 'confirm-regenerate':$('#modal').close();await refresh(true);break;
   case 'preview':preview();break;
   case 'agent-button':agentDialog();await updateBridgeStatus();break;
   case 'bridge-reconnect':if(live){await api('bridgeReconnect');await updateBridgeStatus();}else toast('请先安装扩展和本机接口');break;
   case 'bridge-toggle':if(live){await api('bridgeEnabled',{value:target.dataset.enabled!=='true'});await updateBridgeStatus();}else toast('演示不连接真实 Chrome');break;
   case 'install-help':case 'help':helpDialog();break;
   case 'expand':await api('openDashboard');break;
   case 'add-space': {const g={id:crypto.randomUUID(),name:'新工作空间',tabIds:[],color:COLORS[plan.groups.length%8],reason:'由你建立'};plan.groups.push(g);plan.source='manual';await saveDraft(true);render();toast('新空间已添加，可从页面右侧菜单移入标签页。');break;}
   case 'apply':
    busy=true;target.disabled=true;target.textContent='正在整理…';
    try {const applied=structuredClone(plan);await api('apply',{plan});$('#modal').close();state=await api('state');plan={...applied,fingerprint:fingerprint(state.tabs),groups:applied.groups.map(g=>({...g,tabIds:g.tabIds.filter(id=>!applied.closeIds.includes(id))})).filter(g=>g.tabIds.length),closeIds:[]};stale=false;await saveDraft();view='windows';render();toast(live?'整理完成，恢复记录已保存':'演示整理完成，可在恢复记录中撤销');}
    catch(err){$('#apply-error').textContent=err.message;$('#apply-error').classList.remove('hidden');await refresh();}finally{busy=false;target.disabled=false;target.textContent=live?'应用整理方案':'模拟应用方案';render();}break;
   case 'restore':
    modal('恢复上一次整理前的布局？','<p>现存标签页会移回原窗口。此次去重关闭的副本将按网址重新打开；后来新开的页面会保留。</p>','<button id="confirm-restore" class="button primary">确认恢复布局</button>');break;
   case 'confirm-restore':
    busy=true;target.disabled=true;target.textContent='正在恢复…';
    try {await api('restore');$('#modal').close();await refresh(true);toast('已恢复整理前的布局');}catch(err){$('#modal').close();error(err);await refresh();}finally{busy=false;render();}break;
   case 'export-backup':download('pagefold-recovery.json',state.transaction);break;
   case 'discard-recovery':modal('结束这次恢复记录？','<p>将先下载恢复记录，再移除扩展内的恢复点。当前浏览器布局保持不变，之后可以生成新的整理方案。</p>','<button id="confirm-discard-recovery" class="button danger">导出并结束这次恢复</button>');break;
   case 'confirm-discard-recovery':download('pagefold-recovery.json',state.transaction);await api('discardRecovery');$('#modal').close();await refresh(true);toast('恢复记录已导出，已可开始新的整理');break;
   case 'pause':await api('pause',{value:!state.paused});await refresh();break;
   case 'export-events':download('pagefold-timeline.json',state.events);break;
   case 'clear-events':modal('清空本机时间线？','<p>删除所有已记录的访问事件，无法撤销。标签页和恢复记录仍保留。</p>','<button id="confirm-clear" class="button danger">清空时间线</button>');break;
   case 'confirm-clear':await api('clearEvents');$('#modal').close();await refresh();toast('时间线已清空');break;
   case 'export-agent':download('pagefold-agent-context.json',agentPacket(state.tabs,state.events,plan));break;
   case 'copy-agent':await navigator.clipboard.writeText(JSON.stringify(agentPacket(state.tabs,state.events,plan),null,2));toast('已复制协作材料');break;
   case 'import-agent':
    try {let text=$('#agent-input').value.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');let value=JSON.parse(text);if(value.suggestedPlan)value=value.suggestedPlan;value.closeIds=[];validatePlan(value,state.tabs);plan={...value,source:'agent'};stale=false;await saveDraft(true);view='spaces';$('#modal').close();render();toast('Agent 方案已导入，请检查后再应用');}catch(err){$('#agent-error').textContent=err.message;$('#agent-error').classList.remove('hidden');}break;
   case 'reset-demo':demo=demoState();localStorage.removeItem('pagefold-demo');await refresh(true);toast('演示已重置');break;
  }
 }catch(err){error(err);}
});
document.addEventListener('change',e=>{
 const target=e.target;
 insightChange(target,{api,refresh,render}).catch(error);
 if(target.id==='mobile-nav') {if(target.value==='agent'){agentDialog();updateBridgeStatus();}else{view=target.value;query='';$('#search').value='';render();}}
 if(target.dataset.rename) {const g=plan.groups.find(g=>g.id===target.dataset.rename);g.name=target.value.trim()||g.name;g.lockedIds=[...g.tabIds];target.value=g.name;plan.source='manual';}
 if(target.dataset.move) {const id=Number(target.dataset.move);plan.groups.forEach(g=>{g.tabIds=g.tabIds.filter(x=>x!==id);g.lockedIds=(g.lockedIds||[]).filter(x=>x!==id);});const dest=plan.groups.find(g=>g.id===target.value);dest.tabIds.push(id);dest.lockedIds=[...(dest.lockedIds||[]),id];plan.source='manual';render();}
 if(target.dataset.close) {
  const old=[...plan.closeIds],id=Number(target.dataset.close);plan.closeIds=target.checked?[...old,id]:old.filter(x=>x!==id);
  try {validatePlan(plan,state.tabs);plan.source='manual';}catch(err){plan.closeIds=old;error(err);}render();
 }
 if(target.dataset.rename||target.dataset.move||target.dataset.close) saveDraft(true).catch(error);
});
$('#search').addEventListener('input',e=>{query=e.target.value;timelineLimit=30;render();});
document.addEventListener('toggle',e=>{const id=e.target.dataset?.timelineExpand;if(id){if(e.target.open)expandedTimeline.add(id);else expandedTimeline.delete(id);}},true);
document.addEventListener('keydown',e=>{if(e.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {e.preventDefault();$('#search').focus();}});
$('#modal').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
if(new URLSearchParams(location.search).has('panel')) $('#expand').classList.remove('hidden');
if(live) {
 let timer;const dirty=()=>{if(busy)return;clearTimeout(timer);timer=setTimeout(()=>refresh().catch(error),600);};
 chrome.tabs.onCreated.addListener(dirty);chrome.tabs.onRemoved.addListener(dirty);chrome.tabs.onMoved.addListener(dirty);chrome.tabs.onAttached.addListener(dirty);
 chrome.tabs.onUpdated.addListener((id,c)=>{if(c.url||c.title||c.pinned!==undefined||c.groupId!==undefined) dirty();});
 chrome.storage.onChanged.addListener(changes=>{if(changes.analysis){analysis=changes.analysis.newValue||{status:'idle'};if(state)render();}if(changes.events||changes.paused||changes.projects||changes.historyImport||changes.analysisReports||changes.archivedGroups||changes.analysisSource||changes.closedTabs) dirty();const d=changes.draft?.newValue;if(d&&state&&!busy&&d.sessionId===state.sessionId&&d.plan.fingerprint===fingerprint(state.tabs)){plan=d.plan;stale=false;render();}});
}
refresh().catch(e=>{showNotice('无法加载浏览器状态：'+e.message);$('#content').innerHTML=empty('暂时无法连接','请刷新工作台；如刚更新扩展，请先在扩展管理页重新加载。');});
