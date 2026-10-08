// Copy source assets only. This never invokes Gradle or produces an APK.
import {cp,readFile,writeFile} from 'node:fs/promises';
const destination='android/app/src/main/assets/www';
for(const file of ['app.js','engine.js','sounds.js','task-motion.js','account.js','cloud-store.js','delight.js','supabase-config.js','style.css','icon.svg','manifest.webmanifest','sw.js','vendor','icons','audio'])await cp(file,`${destination}/${file}`,{recursive:true});
const html=(await readFile('index.html','utf8')).replace('<script type="module"','<script src="./native-bridge.js"></script>\n  <script type="module"');
await writeFile(`${destination}/index.html`,html);
