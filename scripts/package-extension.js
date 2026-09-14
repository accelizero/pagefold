import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'extension');
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
const destination=path.join(root,'artifacts',`pagefold-chrome-v${manifest.version}.zip`);
const temporary=destination.replace(/\.zip$/,`.${process.pid}.zip`);
await fs.mkdir(path.dirname(destination),{recursive:true});
const files=(await fs.readdir(source)).filter(name=>!name.startsWith('.'));
try {
 const packed=spawnSync('zip',['-q','-r',temporary,...files],{cwd:source,encoding:'utf8'});
 if(packed.status!==0)throw Error(packed.stderr||'打包失败');
 const check=spawnSync('unzip',['-p',temporary,'manifest.json'],{encoding:'utf8'});
 if(check.status!==0||JSON.parse(check.stdout).version!==manifest.version)throw Error('安装包根目录清单校验失败');
 const integrity=spawnSync('unzip',['-t',temporary],{encoding:'utf8'});
 if(integrity.status!==0)throw Error('安装包完整性校验失败');
 await fs.rename(temporary,destination);
 console.log(destination);
}finally{await fs.rm(temporary,{force:true});}
