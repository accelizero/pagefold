import {encodeFrame,frameReader} from '../../bridge/protocol.js';
const out=x=>process.stdout.write(encodeFrame(x));const pending=new Map();
process.stdin.on('data',frameReader(message=>{
 if(message.type==='analyze_start'){
  const timer=setTimeout(()=>{pending.delete(message.id);const ids=message.context.tabs.filter(t=>!t.pinned).map(t=>t.id);if(message.context.tabs.some(t=>t.title==='Incomplete fixture'))ids.pop();out({type:'analysis_result',id:message.id,ok:true,result:{model:'test-model',groups:[{name:'模型的研究分类',color:'blue',tabIds:ids,reason:'测试固定返回'}]}});},700);
  pending.set(message.id,timer);
 }
 if(message.type==='analyze_cancel'){clearTimeout(pending.get(message.id));pending.delete(message.id);}
},()=>process.exit(1)));
process.stdin.on('end',()=>process.exit());out({type:'ready'});
