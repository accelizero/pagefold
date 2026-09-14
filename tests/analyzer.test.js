import test from 'node:test';import assert from 'node:assert/strict';
import {analyze,validateResult,decodeAssignments} from '../bridge/analyzer.js';
import {analysisContext,fingerprint,reconcilePlan,validatePlan,preserveManualGroups} from '../extension/core.js';

const tabs=[{id:1,url:'https://example.com/cad',title:'CAD research'},{id:2,url:'https://example.org/cad',title:'CAD tests'},{id:3,url:'https://mail.example.com/',title:'Mail',pinned:true}];
const groups=[{name:'建筑研究',color:'green',tabIds:[1,2],reason:'CAD 项目'}];
test('model must cover every movable tab exactly once and cannot close tabs',()=>{
 assert.equal(validateResult({groups,closeIds:[1]},tabs).closeIds,undefined);
 for(const ids of [[1],[1,1],[1,2,3],[1,99]])assert.throws(()=>validateResult({groups:[{...groups[0],tabIds:ids}]},tabs));
});
test('analysis removes credentials, query parameters, window hints and raw plan fingerprint',()=>{
 const context=analysisContext([{...tabs[0],url:'https://user:pass@example.com/page?disposable_login_token=SECRET#access_token=OTHER',title:'URL https://example.com/?key=SECRET',windowId:9}],[{url:'https://example.com/?token=SECRET'}],{source:'agent',fingerprint:'SECRET',groups});
 assert.doesNotMatch(JSON.stringify(context),/SECRET|OTHER|user:pass|windowId|fingerprint/);
});
test('refresh preserves semantic assignments, moves navigation and new tabs to pending, clears close choices',()=>{
 const plan={version:1,source:'agent',fingerprint:fingerprint(tabs),groups:[{...groups[0],id:'one'}],closeIds:[]};
 const changed=[{...tabs[0],windowId:10},{...tabs[1],url:'https://other.com/new'},tabs[2],{id:4,title:'New',url:'https://new.com/'}];
 const next=reconcilePlan(plan,changed);assert.deepEqual(next.groups[0].tabIds,[1]);assert.equal(next.groups[0].name,'建筑研究');assert.deepEqual(next.groups[1].tabIds,[2,4]);assert.ok(validatePlan(next,changed));
});

const config={baseURL:'https://example.test/v1',apiKey:'TEST_ONLY_KEY',model:'test-model'};
test('API adapter sends a bounded metadata-only prompt and validates JSON',async()=>{
 const fetchFn=async(url,opts)=>{assert.equal(url,'https://example.test/v1/chat/completions');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer TEST_ONLY_KEY');const p=JSON.parse(opts.body);assert.equal(p.model,'test-model');assert.equal(p.tools,undefined);assert.doesNotMatch(p.messages[1].content,/windowId|fingerprint|TEST_ONLY_KEY/);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({groups:groups.map(({tabIds,...g})=>g),assignments:{1:1,2:1}})},finish_reason:'stop'}]}));};
 assert.deepEqual(await analyze({tabs},{fetchFn,config}),{groups,model:'test-model'});
});
test('API failure, malformed result, truncated result, cancellation and timeout preserve previous classification',async()=>{
 for(const [response,pattern] of [[new Response('private server details',{status:429}),/额度/],[new Response(JSON.stringify({choices:[{message:{content:'bad json'}}]})),/JSON/],[new Response(JSON.stringify({choices:[{finish_reason:'length'}]})),/不完整/]])await assert.rejects(analyze({tabs},{config,fetchFn:async()=>response}),pattern);
 const c=new AbortController();c.abort();await assert.rejects(analyze({tabs},{config,signal:c.signal}),/取消/);
 const fetchFn=async(url,{signal})=>new Promise((resolve,reject)=>{const timer=setTimeout(resolve,1000);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('aborted'));});});
 await assert.rejects(analyze({tabs},{config,fetchFn,timeoutMs:10}),/超时/);
});
test('manual assignments and names survive a later model reclassification',()=>{
 const result=preserveManualGroups(groups,{groups:[{name:'我命名的项目',color:'blue',tabIds:[1],lockedIds:[1]}]},tabs);
 assert.deepEqual(result.map(g=>[g.name,g.tabIds]),[['建筑研究',[2]],['我命名的项目',[1]]]);
});

test('compact assignments map back to original IDs and reject unknown groups or missing keys',()=>{const original=[{...tabs[0],id:1890554022},{...tabs[1],id:1890553323}];assert.deepEqual(decodeAssignments({groups,assignments:{1:1,2:1}},original).groups[0].tabIds,[1890554022,1890553323]);for(const assignments of [{1:1},{1:1,2:5},{1:1,3:1}])assert.throws(()=>decodeAssignments({groups,assignments},original));});
