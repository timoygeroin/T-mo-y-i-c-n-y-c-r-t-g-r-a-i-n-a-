import { readFile, writeFile } from 'node:fs/promises';
const header="// GENERATED from canonical src/local-intent-compiler.mjs + src/consumer-local-receptor.mjs.\n// Run node scripts/build-surface-local-actions.mjs to regenerate. No model calls or network effects.\n";
export function buildBrowserLocalActions(compiler,receptor) {
 const compiled=compiler.replace(/\bexport (const|function|async function)\b/g,"$1");
 const local=receptor.replace(/^import \{compileLocalIntent,applyLocalIntent\} from '\.\/local-intent-compiler\.mjs';\s*/,"")
   .replace(/\bexport (const|function|async function)\b/g,"$1");
 if(compiled.includes("export ")||local.includes("export ")||local.includes("import "))
   throw Error('LOCAL_ACTION_SOURCE_NOT_PORTABLE');
 return header+"(function(root){\n'use strict';\n"+compiled+"\n"+local+
   "\nroot.MondayLocalActions=Object.freeze({LOCAL_INTENT_SCHEMA,compileLocalIntent,applyLocalIntent,runLocalAction});\n})(window);\n";
}
if(process.argv[1]?.endsWith('/build-surface-local-actions.mjs')) {
 const compiler=await readFile('src/local-intent-compiler.mjs','utf8');
 const receptor=await readFile('src/consumer-local-receptor.mjs','utf8');
 await writeFile('surfaces/02/local-actions.js',buildBrowserLocalActions(compiler,receptor));
}
