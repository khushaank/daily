import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const result=await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,metafile:true,legalComments:'external',outfile:'vendor/supabase.js'});
const packages=new Set(Object.keys(result.metafile.inputs).filter(p=>p.startsWith('node_modules/')).map(p=>p.startsWith('node_modules/@')?p.split('/').slice(0,3).join('/'):p.split('/').slice(0,2).join('/')));
const notices=[];
for(const path of packages){const pkg=JSON.parse(await readFile(`${path}/package.json`,'utf8'));let license;for(const name of ['LICENSE','LICENSE.md','LICENSE.txt']){try{license=await readFile(`${path}/${name}`,'utf8');break;}catch{}}if(!license)throw Error(`Missing license: ${pkg.name}`);notices.push(`${pkg.name} ${pkg.version}\n${license}`);}
await writeFile('vendor/THIRD_PARTY_NOTICES.txt',notices.join('\n\n----------------------------------------\n\n'));
