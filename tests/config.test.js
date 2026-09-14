import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadAnalysisConfig} from '../bridge/analyzer.js';
test('API configuration requires explicit key, endpoint and model; private file works without provider defaults',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pagefold-config-'));const options={configDir:dir,defaultEnvFile:path.join(dir,'.env'),env:{}};
 try{
  await assert.rejects(loadAnalysisConfig(options),/尚未配置/);
  await assert.rejects(loadAnalysisConfig({...options,env:{PAGEFOLD_API_KEY:'fixture'}}),/地址与模型/);
  await fs.writeFile(options.defaultEnvFile,'PAGEFOLD_API_KEY=fixture\nPAGEFOLD_BASE_URL=https://example.test/v1/\nPAGEFOLD_MODEL=test-model\n',{mode:0o600});
  assert.deepEqual(await loadAnalysisConfig(options),{apiKey:'fixture',baseURL:'https://example.test/v1',model:'test-model'});
  await assert.rejects(loadAnalysisConfig({...options,env:{PAGEFOLD_BASE_URL:'http://example.test/v1'}}),/HTTPS/);
  await fs.chmod(options.defaultEnvFile,0o644);await assert.rejects(loadAnalysisConfig(options),/仅当前用户可读/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
