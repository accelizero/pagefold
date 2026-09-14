import test from 'node:test';import assert from 'node:assert/strict';
import {timelineSessions,timelineContext,timelineTitle} from '../extension/timeline.js';
const base=new Date(2026,8,14,16,22,0).getTime();
const event=(seconds,type='activate',extra={})=>({ts:base+seconds*1000,type,sessionId:'a',tabId:1,windowId:1,url:'https://linux.do/t/one',title:'一个讨论',...extra});
test('short Chrome departures stay in one readable sequence with explicit breaks and return visits',()=>{
 const events=[event(0),event(1,'focus'),event(4,'blur'),event(24,'focus'),event(35,'activate',{tabId:2,url:'https://linux.do/t/two'}),event(50)];
 const original=structuredClone(events),ss=timelineSessions(events);assert.equal(ss.length,1);assert.deepEqual(ss[0].visits.map(v=>v.kind),['visit','break','visit','visit','visit']);assert.equal(ss[0].visits[0].signals,2);assert.equal(ss[0].visits.at(-1).returned,true);assert.equal(ss[0].visits[1].returnAt-base,24000);assert.deepEqual(events,original);
});
test('long departures, idle, pause, browser restart, midnight and long gaps have distinct boundaries',()=>{
 for(const [boundary,next,reason] of [[event(5,'blur'),event(80),'离开 Chrome'],[event(5,'idle'),event(20),'空闲'],[event(5,'pause'),event(20),'暂停'],[null,event(20,'activate',{sessionId:'b'}),'浏览器会话'],[null,event(901),'15 分钟'],[null,event(24*3600),'新的一天']]){
  const ss=timelineSessions([event(0),...(boundary?[boundary]:[]),next]);assert.equal(ss.length,2);assert.ok(ss[1].reason.includes(reason),ss[1].reason);
 }
});
test('current project labels match filtered URLs, detect navigation and avoid ambiguous historical projects',()=>{
 const tabs=[{id:1,url:'https://linux.do/t/one?utm_source=x'},{id:2,url:'https://linux.do/t/one?ref=two'}],groups=[{id:'a',name:'项目 A',tabIds:[1]},{id:'b',name:'项目 B',tabIds:[2]}];
 assert.equal(timelineContext(event(0),tabs,groups,'a').group.name,'项目 A');
 assert.equal(timelineContext(event(0,'activate',{sessionId:'old'}),tabs,groups,'a').group,null);
 const moved=timelineContext(event(0),[{id:1,url:'https://elsewhere.test'}],groups,'a');assert.equal(moved.tab,null);assert.equal(moved.historical,true);
 assert.equal(timelineTitle('\u200b\u2060一篇文章\ufeff','https://linux.do/'),'一篇文章');
});
