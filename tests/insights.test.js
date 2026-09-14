import test from 'node:test';import assert from 'node:assert/strict';
import {buildTrails,validateActivities,validateProjects,defaultProjects,removeSpace,restoreSpace,coUsage} from '../extension/insights.js';
import {importHistory} from '../extension/history-import.js';
import {fingerprint,validatePlan} from '../extension/core.js';
import {analyze} from '../bridge/analyzer.js';
const a={type:'activate',sessionId:'session',tabId:1,windowId:1,url:'https://a.test/',title:'A'};
const events=[{...a,ts:10000},{...a,ts:20000,tabId:2,url:'https://b.test/',title:'B'},{...a,ts:30000},{type:'idle',ts:40000},{...a,ts:50000}];
test('affinity keeps A B A and separate repeat activities, while source signals never mix',()=>{
 const trails=buildTrails(events,{visits:[{visitId:'v1',ts:20000,title:'A',url:a.url}]},'both');
 assert.equal(trails.length,3);assert.deepEqual(trails.find(t=>t.visits.length===3).visits.map(v=>v.title),['A','B','A']);
 assert.equal(coUsage(trails)[0].count,1);
 assert.equal(buildTrails(events,null,'history').length,0);
 const many=Array.from({length:400},(_,i)=>({...a,ts:10000+i*3000,url:`https://a.test/${i}`}));assert.equal(buildTrails(many)[0].visits.length,60);assert.ok(buildTrails(many)[0].truncated);
});
test('AI segments must cover ordered visits exactly and only use existing multi-project tags',()=>{
 const trails=buildTrails(events),value=Object.fromEntries(trails.map(t=>[t.id,[{start:0,end:t.visits.length-1,name:'一次研究',reason:'有序访问',tags:[{projectId:'papers',topic:''},{projectId:'evaluation',topic:'基准与方法'}]}]]));
 const result=validateActivities(value,trails,defaultProjects);assert.equal(result.length,2);assert.equal(result[1].visits.length,3);assert.equal(result[1].tags.length,2);
 for(const mutate of [x=>{delete x[trails[0].id]},x=>{x[trails[1].id][0].start=1},x=>{x[trails[1].id][0].end=1},x=>{x[trails[0].id][0].tags[0].topic='made up'}]){const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateActivities(bad,trails,defaultProjects));}
});
test('workspace removal is reversible without closing tabs, and restore skips navigated tabs',()=>{
 const tabs=[{id:1,url:a.url},{id:2,url:'https://b.test/'}],plan={version:1,source:'agent',fingerprint:fingerprint(tabs),groups:[{id:'g',name:'项目',color:'green',tabIds:[1,2]}],closeIds:[]};
 const next=removeSpace(plan,'g',tabs);assert.deepEqual(next.plan.closeIds,[]);assert.ok(validatePlan(next.plan,tabs));assert.deepEqual(plan.groups[0].tabIds,[1,2]);
 const restored=restoreSpace(next.plan,next.archive,tabs);assert.equal(restored.groups.at(-1).name,'项目');assert.ok(validatePlan(restored,tabs));
 const partial=restoreSpace(next.plan,next.archive,[tabs[0],{...tabs[1],url:'https://new.test/'}]);assert.deepEqual(partial.groups.at(-1).tabIds,[1]);
});
test('history import retains repeated visits and references, rejects missing permission and filters private parameters',async()=>{
 const now=10*86400000,chrome={permissions:{contains:async()=>true},history:{search:async()=>[{url:'https://a.test/?token=SECRET',title:'A'}],getVisits:async()=>[{visitId:'1',visitTime:now-1000,referringVisitId:'0',transition:'link',isLocal:true},{visitId:'2',visitTime:now,referringVisitId:'1',transition:'typed',isLocal:true},{visitId:'3',visitTime:now,isLocal:false},{visitId:'4',visitTime:0}]}};
 const history=await importHistory(chrome,now);assert.equal(history.visits.length,2);assert.equal(history.visits[1].referringVisitId,'1');assert.doesNotMatch(JSON.stringify(history),/SECRET/);
 chrome.permissions.contains=async()=>false;await assert.rejects(importHistory(chrome),/允许/);
});
test('project configuration rejects duplicate ids and excessive or malformed values',()=>{assert.equal(validateProjects(defaultProjects).length,3);for(const value of [[defaultProjects[0],defaultProjects[0]],[{...defaultProjects[0],name:''}],[{...defaultProjects[0],children:['x'.repeat(61)]}]])assert.throws(()=>validateProjects(value));});
test('API receives project hints and ordered trails, and returns a validated activity report',async()=>{
 const trails=buildTrails(events),tabs=[{id:1,title:'研究论文',url:a.url}],config={baseURL:'https://test.test',apiKey:'fixture',model:'test'};
 const result=await analyze({tabs,projects:defaultProjects,trails},{config,fetchFn:async(url,opts)=>{
  const body=JSON.parse(opts.body),input=JSON.parse(body.messages[1].content);assert.equal(input.projects[0].name,'社媒调研');assert.deepEqual(input.trails[1].visits.map(v=>v.title),['A','B','A']);
  return Response.json({choices:[{message:{content:JSON.stringify({groups:[{name:'论文方法',color:'blue',reason:'研究方法',tags:[{projectId:'papers',topic:''}]}],assignments:{1:1},summary:'两次不同的研究活动',trajectories:Object.fromEntries(input.trails.map(t=>[t.id,{segments:[{name:'研究方法',reason:'连续访问',tags:[{projectId:'papers',topic:''}]}],assignments:Object.fromEntries(t.visits.map((v,i)=>[String(i),1]))}]))})}}]});
 }});assert.equal(result.activities.length,2);assert.equal(result.groups[0].tags[0].projectId,'papers');
});

test('per-visit AI assignment decoding rejects omissions and unused segments; returning to a topic starts another contiguous activity',async()=>{
 const {decodeTrajectories}=await import('../bridge/analyzer.js');const trails=[buildTrails(events).find(t=>t.visits.length===3)],t=trails[0],segment={name:'活动',reason:'依据',tags:[]};
 const value={[t.id]:{segments:[segment,segment],assignments:{0:1,1:1,2:2}}};assert.equal(decodeTrajectories(value,trails,[]).length,2);
 assert.equal(decodeTrajectories({[t.id]:{segments:[segment,segment],assignments:{0:1,1:2,2:1}}},trails,[]).length,3);
 for(const assignments of [{0:1,1:1},{0:1,1:1,2:1},{0:2,1:2,2:2}])assert.throws(()=>decodeTrajectories({[t.id]:{segments:[segment,segment],assignments}},trails,[]));
});
