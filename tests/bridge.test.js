import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFrame,frameReader} from '../bridge/protocol.js';
import {extensionId,registerMcp} from '../bridge/install.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('native protocol handles fragmented and concatenated UTF-8 frames',()=>{
 const seen=[],read=frameReader(x=>seen.push(x),e=>{throw e;}),a=encodeFrame({title:'网页正文'}),b=encodeFrame({id:2});
 read(a.subarray(0,2));read(a.subarray(2,9));read(Buffer.concat([a.subarray(9),b]));assert.deepEqual(seen,[{title:'网页正文'},{id:2}]);
});
test('native protocol rejects oversized and malformed frames',()=>{
 const errors=[],read=frameReader(()=>assert.fail(),e=>errors.push(e)),head=Buffer.alloc(4);head.writeUInt32LE(20*1024*1024);read(head);assert.equal(errors.length,1);
 const malformed=Buffer.from([2,0,0,0,120,120]);frameReader(()=>assert.fail(),e=>errors.push(e))(malformed);assert.equal(errors.length,2);
});
test('fixed public manifest key yields a valid Chrome extension id',()=>{
 const m=JSON.parse(fs.readFileSync('extension/manifest.json'));assert.match(extensionId(m.key),/^[a-p]{32}$/);assert.ok(m.permissions.includes('nativeMessaging'));assert.equal(m.incognito,'not_allowed');
});
test('MCP registration preserves existing config text and is repeatable',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pagefold-config-')),config=path.join(dir,'config.toml');const original='# Keep this comment\nmodel = "example"\n[mcp_servers.other]\ncommand = "existing-tool"\nenabled = false\n';fs.writeFileSync(config,original);
 try {await registerMcp(config,dir);const updated=fs.readFileSync(config,'utf8');assert.ok(updated.startsWith(original.trimEnd()));assert.match(updated,/\[mcp_servers.pagefold\]/);assert.ok((await registerMcp(config,dir)).alreadyRegistered);assert.equal(fs.readFileSync(config,'utf8'),updated);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
