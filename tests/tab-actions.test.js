import test from 'node:test';import assert from 'node:assert/strict';import {closeTab} from '../extension/tab-actions.js';
test('direct close rechecks navigation and protected state immediately before removal',async()=>{
 for(const change of [{url:'https://changed.test/'},{pinned:true},{audible:true}]){
  let reads=0,removals=0;const storage={};const tab={id:1,url:'https://original.test/',windowId:1,index:0};
  const api={tabs:{get:async()=>reads++?{...tab,...change}:tab,remove:async()=>removals++},windows:{get:async()=>({type:'normal'})},storage:{local:{get:async()=>({})},session:{get:async()=>storage,set:async data=>Object.assign(storage,structuredClone(data))}}};
  await assert.rejects(closeTab(api,{id:1,expectedUrl:tab.url,sessionId:'s'},'s'),/变化/);assert.equal(removals,0);assert.equal(storage.closedTabs[0].status,'failed');
 }
});
