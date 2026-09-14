import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parse} from 'smol-toml';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function extensionId(key){return createHash('sha256').update(Buffer.from(key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));}
export async function registerMcp(config,dataDir) {
 let original='';try{original=await fs.readFile(config,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 const parsed=parse(original),expected={command:process.execPath,args:[path.join(root,'bridge/mcp-server.js')]},existing=parsed.mcp_servers?.pagefold;
 if(existing){if(existing.command!==expected.command||JSON.stringify(existing.args)!==JSON.stringify(expected.args))throw Error('已有不同的 pagefold MCP 配置，未覆盖。');return {alreadyRegistered:true};}
 const block=`\n\n[mcp_servers.pagefold]\ncommand = ${JSON.stringify(expected.command)}\nargs = [${JSON.stringify(expected.args[0])}]\n`,updated=original.trimEnd()+block;
 const check=parse(updated);delete check.mcp_servers.pagefold;if(!parsed.mcp_servers)delete check.mcp_servers;
 if(JSON.stringify(parsed)!==JSON.stringify(check))throw Error('配置校验失败，未写入。');
 await fs.mkdir(path.dirname(config),{recursive:true});await fs.mkdir(dataDir,{recursive:true,mode:0o700});
 const backup=path.join(dataDir,'codex-config-before-'+Date.now()+'.toml');await fs.writeFile(backup,original,{mode:0o600});
 let latest='';try{latest=await fs.readFile(config,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}if(latest!==original)throw Error('Codex 配置同时发生变化，请重新安装。');
 await fs.writeFile(config,updated,{mode:0o600});return {alreadyRegistered:false,backup};
}
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
export async function installNative({browser='Chrome',userDataDir,dataDir=path.join(os.homedir(),'.local/share/pagefold'),hostName='com.pagefold.bridge',extensionPath=path.join(root,'extension')}={}) {
 if(process.platform!=='darwin')throw Error('自动安装器目前支持 macOS。');
 if(!['Chrome','ChromeForTesting','Chromium'].includes(browser)||!/^com\.pagefold\.[a-z0-9_]+$/.test(hostName))throw Error('Invalid install target');
 const manifest=JSON.parse(await fs.readFile(path.join(extensionPath,'manifest.json'),'utf8')),id=extensionId(manifest.key);
 const dir=userDataDir?path.join(userDataDir,'NativeMessagingHosts'):path.join(os.homedir(),'Library/Application Support',browser==='Chromium'?'Chromium':`Google/${browser}`,'NativeMessagingHosts');
 await fs.mkdir(dataDir,{recursive:true,mode:0o700});await fs.chmod(dataDir,0o700);await fs.mkdir(dir,{recursive:true});
 const launcher=path.join(dataDir,hostName+'.sh'),manifestPath=path.join(dir,hostName+'.json');
 const files={[launcher]:`#!/bin/sh\nexport PAGEFOLD_DATA_DIR=${quote(dataDir)}\nexec ${quote(process.execPath)} ${quote(path.join(root,'bridge/native-host.js'))} "$@"\n`,[manifestPath]:JSON.stringify({name:hostName,description:'Pagefold local Chrome bridge',path:launcher,type:'stdio',allowed_origins:[`chrome-extension://${id}/`]},null,2)+'\n'};
 for(const [file,text]of Object.entries(files)) {
  try{const previous=await fs.readFile(file,'utf8');if(previous!==text)await fs.copyFile(file,file+'.backup-'+Date.now());}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.writeFile(file,text,{mode:file===launcher?0o700:0o600});await fs.chmod(file,file===launcher?0o700:0o600);
 }
 return {extensionId:id,manifestPath,launcher,dataDir,extensionPath};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const result=await installNative();
 if(!process.argv.includes('--native-only')) {
  const configHome=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),config=path.join(configHome,'config.toml');
  result.mcp=await registerMcp(config,result.dataDir);
 }
 console.log(JSON.stringify({...result,next:'在 Chrome 加载/重新加载 extension 文件夹。然后打开拾页 → Agent 协作检查连接。Codex 新任务可使用 pagefold 工具。'},null,2));
}
