import { readFileSync } from 'node:fs';
const required=['MONDAY_AND_MONDAYID_REQUIRED','NATIVE_BODY_NOT_A_SITE','NO_GLOBAL_READY_WHILE_OPEN_LOOPS_EXIST','CROSS_CHAT_CROSS_MONTH_CONTINUITY'];
const core=readFileSync(new URL('./core.js',import.meta.url),'utf8');
const swift=readFileSync(new URL('../apps/ios/Monday/MondayApp.swift',import.meta.url),'utf8');
const checks=[
  ['identity',required.every(x=>core.includes(x))],['raw-signal',core.includes('signals')],['sqlite',core.includes('node:sqlite')],['evidence-gate',core.includes('UNREGISTERED_EVIDENCE')],['human-gate',core.includes('HUMAN_GATE_REQUIRED')],['open-loop-gate',core.includes("status!='DONE'")],['mcp',readFileSync(new URL('./mcp.js',import.meta.url),'utf8').includes('tools/call')],['native-swiftui',swift.includes('import SwiftUI')],['not-webview',!swift.includes('WKWebView')],['stable-tabs',['Home','Chats','Create','Spaces','You'].every(x=>swift.includes(x))]
];
for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(checks.some(x=>!x[1])) process.exit(1); console.log(`PASS ${checks.length}/${checks.length} AntiMonday checks`);
