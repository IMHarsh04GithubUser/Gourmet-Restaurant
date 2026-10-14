import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const commands=[['RestBackend',['--watch','index.js']],['Restaurant',['node_modules/vite/bin/vite.js']],['AdminPanel',['node_modules/vite/bin/vite.js']]];
const children=[];let stopped=false;
function stop(code=0){if(stopped)return;stopped=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
for(const [folder,args] of commands){const child=spawn(process.execPath,args,{cwd:path.join(root,folder),stdio:'inherit'});children.push(child);child.on('error',error=>{console.error(`${folder}: ${error.message}`);stop(1);});child.on('exit',code=>{if(!stopped)stop(code||0);});}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
