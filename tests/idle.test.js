import test from 'node:test';
import assert from 'node:assert/strict';
import {idleCandidates, idleProtected, makeIdleRecord, restoreable, IDLE_MS} from '../extension/idle.js';

const base={id:1,title:'论文',url:'https://example.com/paper',windowId:2,index:3,pinned:false,active:false,audible:false,lastAccessed:Date.now()-IDLE_MS-1000};

test('idle candidates use last access time and preserve flat tab semantics',()=>{
  const now=Date.now();
  const tabs=[base,{...base,id:2,lastAccessed:now-1000},{...base,id:3,pinned:true},{...base,id:4,active:true},{...base,id:5,audible:true}];
  assert.deepEqual(idleCandidates(tabs,[],now).map(t=>t.id),[1]);
  assert.equal(idleProtected(tabs[2]),true);
});

test('stored pages are excluded and records retain workspace metadata',()=>{
  const now=Date.now(), record=makeIdleRecord(base,'论文阅读',now);
  assert.equal(record.workspaceName,'论文阅读');
  assert.equal(record.workspaceId,'');
  assert.deepEqual(idleCandidates([base],[{id:base.id}],now),[]);
});

test('restore skips invalid urls and duplicate open pages',()=>{
  assert.equal(restoreable({url:'chrome://extensions/'},[]),false);
  assert.equal(restoreable({url:'https://example.com/paper'},[{url:'https://example.com/paper',pinned:false}]),false);
  assert.equal(restoreable({url:'https://example.com/paper'},[]),true);
});
