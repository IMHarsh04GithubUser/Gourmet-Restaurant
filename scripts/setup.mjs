import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const folder of ['RestBackend','Restaurant','AdminPanel']) {
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--no-fund'],{cwd:path.join(root,folder),stdio:'inherit',shell:process.platform==='win32'});
  if(result.status!==0) process.exit(result.status||1);
  const envFile=path.join(root,folder,'.env');
  if(!fs.existsSync(envFile)) {
    let content=fs.readFileSync(path.join(root,folder,'.env.example'),'utf8');
    if(folder==='RestBackend') content=content.replace('SECRET_KEY=replace-with-a-generated-random-secret',`SECRET_KEY=${crypto.randomBytes(48).toString('hex')}`);
    fs.writeFileSync(envFile,content,{mode:0o600});
  }
}
console.log('\nSetup complete. Configure RestBackend/.env, then run npm run seed and npm run create-admin. Start all apps with npm run dev.');
