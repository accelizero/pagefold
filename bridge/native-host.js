import {analyze} from './analyzer.js';
import net from 'node:net';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dataDir,socketPath} from './paths.js';
import {encodeFrame,frameReader,MAX_FRAME} from './protocol.js';

process.umask(0o077);
const pending=new Map(),clients=new Set();let ownsSocket=false,stopping=false,analysisJob;
const out=value=>{const data=encodeFrame(value);if(data.length>1024*1024)throw Error('Request exceeds native host message limit');process.stdout.write(data);};
function respond(socket,value){if(!socket.destroyed)socket.write(JSON.stringify(value)+'\n');}
async function shutdown(code=0){if(stopping)return;stopping=true;analysisJob?.controller.abort();for(const socket of clients)socket.destroy();server.close();if(ownsSocket)await fs.unlink(socketPath).catch(()=>{});process.exit(code);}
const server=net.createServer(socket=>{
 clients.add(socket);let buffer='';socket.setEncoding('utf8');
 socket.on('data',chunk=>{
  buffer+=chunk;if(Buffer.byteLength(buffer)>1024*1024){socket.destroy();return;}
  let idx;while((idx=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,idx);buffer=buffer.slice(idx+1);
   try {
    const req=JSON.parse(line);
    if(typeof req.id!=='string'||typeof req.method!=='string'||pending.size>=32)throw Error('Invalid or excessive requests');
    const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);respond(socket,{id:req.id,ok:false,error:'Chrome 响应超时；如果是写操作，不要直接重试，请先读取恢复记录确认结果。'});},120000);timer.unref();
    pending.set(id,{socket,clientId:req.id,timer});out({type:'request',id,method:req.method,params:req.params||{}});
   }catch(error){respond(socket,{ok:false,error:error.message});}
  }
 });
 socket.on('error',()=>{});socket.on('close',()=>{clients.delete(socket);for(const [id,p]of pending)if(p.socket===socket){clearTimeout(p.timer);pending.delete(id);}});
});
server.on('error',error=>{process.stderr.write('Pagefold host: '+error.message+'\n');shutdown(1);});
process.stdin.on('data',frameReader(message=>{
 if(message.type==='analyze_cancel'){if(analysisJob?.id===message.id)analysisJob.controller.abort();return;}
 if(message.type==='analyze_start'){
  if(analysisJob){out({type:'analysis_result',id:message.id,ok:false,error:'已有分析在进行。'});return;}
  const job={id:message.id,controller:new AbortController()};analysisJob=job;
  analyze(message.context,{signal:job.controller.signal,onProgress:text=>out({type:'analysis_progress',id:job.id,text})})
   .then(result=>out({type:'analysis_result',id:job.id,ok:true,result}))
   .catch(error=>{if(!stopping)out({type:'analysis_result',id:job.id,ok:false,error:error.message});})
   .finally(()=>{if(analysisJob===job)analysisJob=null;});return;
 }
 if(message.type!=='response')return;const p=pending.get(message.id);if(!p)return;
 clearTimeout(p.timer);pending.delete(message.id);respond(p.socket,{id:p.clientId,ok:message.ok,data:message.data,error:message.error});
},error=>{process.stderr.write(error.message+'\n');shutdown(1);}));
process.stdin.on('end',()=>shutdown());process.stdin.on('error',()=>shutdown(1));process.stdout.on('error',()=>shutdown(1));
process.on('SIGTERM',()=>shutdown());process.on('SIGINT',()=>shutdown());
await fs.mkdir(dataDir,{recursive:true,mode:0o700});
const dir=await fs.lstat(dataDir);if(!dir.isDirectory()||dir.isSymbolicLink()||(process.getuid&&dir.uid!==process.getuid()))throw Error('Unsafe Pagefold directory');
await fs.chmod(dataDir,0o700);
try {
 const stat=await fs.lstat(socketPath);if(!stat.isSocket()||(process.getuid&&stat.uid!==process.getuid()))throw Error('Unsafe bridge socket path');
 const alive=await new Promise(resolve=>{const s=net.createConnection(socketPath);s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',error=>resolve(error.code!=='ECONNREFUSED'&&error.code!=='ENOENT'));});
 if(alive){process.stderr.write('另一个 Chrome 配置已连接拾页，请先在该配置中停用 Codex 连接。\n');process.exit(1);}
 await fs.unlink(socketPath);
}catch(error){if(error.code!=='ENOENT')throw error;}
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});ownsSocket=true;await fs.chmod(socketPath,0o600);out({type:'ready',version:'0.4.2'});
