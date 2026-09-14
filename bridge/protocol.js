export const MAX_FRAME=16*1024*1024;
export function encodeFrame(value) {
 const body=Buffer.from(JSON.stringify(value)),head=Buffer.alloc(4);head.writeUInt32LE(body.length);return Buffer.concat([head,body]);
}
export function frameReader(onMessage,onError) {
 let buffer=Buffer.alloc(0),failed=false;
 return chunk=>{
  if(failed)return;buffer=Buffer.concat([buffer,chunk]);
  try {
   while(buffer.length>=4){const length=buffer.readUInt32LE(0);if(length>MAX_FRAME||length<2)throw Error('Invalid native message length');if(buffer.length<4+length)return;const value=JSON.parse(buffer.subarray(4,4+length).toString('utf8'));buffer=buffer.subarray(4+length);onMessage(value);}
  }catch(error){failed=true;onError(error);}
 };
}
