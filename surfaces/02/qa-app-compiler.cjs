const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const src=fs.readFileSync(__dirname+'/app-compiler.js','utf8');
function compiler(){const window={};vm.runInNewContext(src,{window});return window.MondayAppCompiler}
test('deterministic offline HTML uses our templates and no external dependencies',()=>{
 const c=compiler(),a=c.compile({kind:'landing',name:'Мой проект',description:'Это наш сайт',theme:'ice'});
 assert.match(a.html,/<!doctype html>/i);assert.match(a.html,/Мой проект/);assert.match(a.html,/viewport/);
 assert.doesNotMatch(a.html,/<script[^>]+src=|<link[^>]+href="https?:|<iframe/i);
 assert.match(a.filename,/\.html$/);
 assert.equal(a.html,c.compile({kind:'landing',name:'Мой проект',description:'Это наш сайт',theme:'ice'}).html);
});
test('task and note apps embed client logic that parses without external SDK',()=>{
 const c=compiler();
 for(const [kind,needle] of [['tasks','taskForm'],['notes','noteForm']]){
   const out=c.compile({kind,name:'Важное',description:'Данные'});
   assert.ok(out.html.includes(needle));assert.match(out.html,/localStorage/);
   const script=out.html.match(/<script>([\s\S]*?)<\/script>/);
   assert.ok(script);
   new vm.Script(script[1]);
 }
});
test('hostile text is escaped, not executable HTML or event handlers',()=>{
 const bad='</script><script>alert(1)</script><img src=x onerror=alert(2)>';
 const html=compiler().compile({kind:'landing',name:bad,description:bad}).html;
 assert.doesNotMatch(html,/<script>alert\(1\)/);
 assert.doesNotMatch(html,/<img[^>]+onerror\s*=/i);
 assert.ok(html.includes('&lt;script&gt;'));
});
test('invalid templates, empty or long name and invalid theme reject',()=>{
 const c=compiler();
 assert.throws(()=>c.compile({kind:'shell',name:'ok'}),/KIND_INVALID/);
 assert.throws(()=>c.compile({kind:'tasks',name:'  '}),/NAME_REQUIRED/);
 assert.throws(()=>c.compile({kind:'notes',name:'X'.repeat(200)}),/NAME_INVALID/);
 assert.throws(()=>c.compile({kind:'notes',name:'valid',theme:'url(javascript:bad)'}),/THEME_INVALID/);
});
test('filename is safe for iPhone Files and has standalone HTML extension',()=>{
 const out=compiler().compile({kind:'notes',name:'../ Новые записи /2026',theme:'night'});
 assert.ok(!out.filename.includes('/')&&!out.filename.includes('\\'));
 assert.match(out.filename,/\.html$/);
 assert.equal(out.externalDependencies,0);
});
