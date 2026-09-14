import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateSets,normalizeURL,fingerprint,sessions,propose,validatePlan,agentPacket,retainEvents,DAY} from '../extension/core.js';
import {demoState} from '../extension/demo.js';

test('normalization preserves meaningful query parameters, hashes and path case',()=>{
 assert.equal(normalizeURL('https://site.test/A?ref=2&utm_source=x&id=1#edit'),'https://site.test/A?ref=2&id=1#edit');
 assert.notEqual(normalizeURL('https://site.test/p?id=1'),normalizeURL('https://site.test/p?id=2'));
 assert.notEqual(normalizeURL('https://site.test/p#edit'),normalizeURL('https://site.test/p#view'));
 assert.equal(normalizeURL('chrome://newtab/'),'chrome://newtab/');
});
test('exact duplicates and tracking candidates stay separate',()=>{
 const {tabs}=demoState(),d=duplicateSets(tabs);assert.equal(d.exact.length,2);assert.equal(d.related.length,1);
 assert.equal(duplicateSets([{id:1,url:'chrome://newtab/'},{id:2,url:'chrome://newtab/'}]).exact.length,0);
});
test('foreground sequence crosses windows but splits on blur, idle, pause and restart',()=>{
 const e=(ts,type='activate',sessionId='a',windowId=1)=>({ts,type,sessionId,windowId,url:'https://a.test/'+ts});
 const result=sessions([e(0),e(1000,'activate','a',2),e(2000,'blur'),e(3000),e(4000,'idle'),e(5000),e(6000,'pause'),e(7000),e(8000,'activate','b'),e(1000000,'activate','b')]);
 assert.equal(result.length,6);assert.deepEqual(result[0].windowIds,[1,2]);assert.equal(result[0].end,1000);
});
test('suggestion covers every movable tab exactly once, independent of source windows',()=>{
 const {tabs,events}=demoState();const p=propose(tabs,events);assert.ok(validatePlan(p,tabs));
 const expected=p.groups.map(g=>g.tabIds);
 assert.deepEqual(propose(tabs.map(t=>({...t,windowId:99})),events).groups.map(g=>g.tabIds),expected);
 assert.ok(!p.groups.flatMap(g=>g.tabIds).includes(16));
 assert.deepEqual(propose([],[]).groups,[]);
});
test('stale, omitted, duplicated, pinned and unknown ids are rejected',()=>{
 const {tabs,events}=demoState(),p=propose(tabs,events);
 assert.throws(()=>validatePlan(p,tabs.map(t=>({...t,url:t.url+'?changed'}))),/变化/);
 for(const change of [q=>q.groups[0].tabIds.pop(),q=>q.groups[0].tabIds.push(q.groups[0].tabIds[0]),q=>q.groups[0].tabIds.push(16),q=>q.groups[0].tabIds.push(9000)]){const q=structuredClone(p);change(q);assert.throws(()=>validatePlan(q,tabs));}
});
test('duplicate closes preserve a copy and protect active, audible and pinned pages',()=>{
 const {tabs,events}=demoState(),p=propose(tabs,events);p.closeIds=[11];assert.ok(validatePlan(p,tabs));
 p.closeIds=[7,11];assert.throws(()=>validatePlan(p,tabs),/保留副本/);
 for(const key of ['active','audible','pinned']){const changed=tabs.map(t=>({...t,...(t.id===11?{[key]:true}:{})}));const q=propose(changed,events);q.closeIds=[11];assert.throws(()=>validatePlan(q,changed));}
 p.closeIds=[1];assert.throws(()=>validatePlan(p,tabs),/保留副本/);
});
test('agent protocol excludes window hints and exported closure decisions',()=>{
 const {tabs,events}=demoState(),p=propose(tabs,events);p.closeIds=[11];const packet=agentPacket(tabs,events,p);
 assert.deepEqual(packet.suggestedPlan.closeIds,[]);assert.ok(packet.tabs.every(t=>!('windowId' in t)));assert.ok(packet.events.every(t=>!('windowId' in t)));
});
test('fingerprints detect reordering and pending navigation but ignore activity-only changes',()=>{
 const {tabs}=demoState();assert.notEqual(fingerprint(tabs),fingerprint(tabs.map(t=>({...t,index:t.index+1}))));
 assert.notEqual(fingerprint(tabs),fingerprint(tabs.map(t=>({...t,pendingUrl:'https://new.test'}))));
 assert.equal(fingerprint(tabs),fingerprint(tabs.map(t=>({...t,active:!t.active}))));
});
test('retention enforces age and byte budgets with multibyte titles',()=>{
 const now=Date.now(),events=[{ts:now-31*DAY,title:'expired'},...Array.from({length:50},(_,i)=>({ts:now-100+i,title:'页面标题'.repeat(20)}))];
 const kept=retainEvents(events,now,2000);assert.ok(kept.length>0&&kept.length<50);assert.ok(new TextEncoder().encode(JSON.stringify(kept)).length<=2000);assert.equal(kept.at(-1).ts,events.at(-1).ts);
});
