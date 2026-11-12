// Windows-compatible equivalent of the upstream tsc + rm/cp build command.
import {spawnSync} from 'node:child_process';
import {cpSync,mkdirSync} from 'node:fs';
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
mkdirSync('dist/ui',{recursive:true});
cpSync('src/ui','dist/ui',{recursive:true});
