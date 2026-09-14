import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {socketPath} from './paths.js';
import {MAX_FRAME} from './protocol.js';
export function request(method,params={},options={}) {
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection(options.socketPath||socketPath),id=randomUUID();let buffer='',done=false;
  const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(data);};
  const timer=setTimeout(()=>finish(Error('本机连接响应超时。写操作可能仍在进行，请先读取恢复记录，勿直接重试。')),options.timeout||125000);
  socket.setEncoding('utf8');socket.once('connect',()=>socket.write(JSON.stringify({id,method,params})+'\n'));
  socket.on('data',chunk=>{buffer+=chunk;if(Buffer.byteLength(buffer)>MAX_FRAME){finish(Error('响应过大，请缩小读取范围。'));return;}const end=buffer.indexOf('\n');if(end<0)return;try{const r=JSON.parse(buffer.slice(0,end));if(r.id!==id)throw Error('响应编号不匹配');finish(r.ok?null:Error(r.error||'Chrome 请求失败'),r.data);}catch(error){finish(error);}});
  socket.on('error',error=>finish(Error(['ENOENT','ECONNREFUSED'].includes(error.code)?'拾页尚未连接 Chrome。请加载拾页扩展，打开拾页 → Agent 协作 → 重连。首次安装先运行 npm run setup:mcp。':error.message)));
  socket.on('end',()=>finish(Error('Chrome 连接已断开。写操作结果不确定，请重连后读取恢复记录。')));
 });
}
