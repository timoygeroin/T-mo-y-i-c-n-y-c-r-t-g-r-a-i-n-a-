/* MondayID offline HTML compiler: locally authored, no external SDK. */
(function(root){'use strict';
const kinds=['landing','tasks','notes'];
const themes={ice:['#a6d7dd','#13191b','#1d2629','#f2f5f4'],night:['#b6b4ee','#15151c','#22222e','#f5f3fc'],pearl:['#466f7c','#f1f3f0','#ffffff','#1b262b']};
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'monday-app';
function localKey(name,kind){let h=2166136261,t=kind+'|'+name;for(let i=0;i<t.length;i++)h=Math.imul(h^t.charCodeAt(i),16777619)>>>0;return 'monday.generated.v1.'+h.toString(16)}
function taskRuntime(key){'use strict';
 let items=[];const form=document.getElementById('taskForm'),input=document.getElementById('taskInput'),list=document.getElementById('taskList'),status=document.getElementById('storageStatus');
 try{const old=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(old))items=old.filter(x=>x&&typeof x.text==='string').slice(0,1000)}catch{status.textContent='Сохранение недоступно: записи останутся только до закрытия страницы.'}
 function save(){try{localStorage.setItem(key,JSON.stringify(items))}catch{status.textContent='Хранилище браузера недоступно. Сохрани важные данные отдельно.'}}
 function draw(){list.replaceChildren();items.forEach((item,i)=>{const li=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input'),span=document.createElement('span'),del=document.createElement('button');check.type='checkbox';check.checked=!!item.done;span.textContent=item.text;span.style.textDecoration=item.done?'line-through':'none';check.addEventListener('change',()=>{item.done=check.checked;save();draw()});del.type='button';del.textContent='Удалить';del.addEventListener('click',()=>{items.splice(i,1);save();draw()});label.append(check,span);li.append(label,del);list.append(li)});document.getElementById('taskCount').textContent=items.filter(x=>!x.done).length+' осталось'}
 form.addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(!text)return;items.push({text:text.slice(0,180),done:false});input.value='';save();draw()});draw();
}
function notesRuntime(key){'use strict';
 let items=[];const form=document.getElementById('noteForm'),input=document.getElementById('noteInput'),list=document.getElementById('noteList'),status=document.getElementById('storageStatus');
 try{const old=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(old))items=old.filter(x=>typeof x==='string').slice(0,500)}catch{status.textContent='Сохранение недоступно: записи останутся только до закрытия страницы.'}
 function save(){try{localStorage.setItem(key,JSON.stringify(items))}catch{status.textContent='Хранилище браузера недоступно. Сохрани важные данные отдельно.'}}
 function draw(){list.replaceChildren();items.forEach((item,i)=>{const li=document.createElement('li'),p=document.createElement('p'),del=document.createElement('button');p.textContent=item;del.type='button';del.textContent='Удалить';del.addEventListener('click',()=>{items.splice(i,1);save();draw()});li.append(p,del);list.append(li)})}
 form.addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(!text)return;items.unshift(text.slice(0,4000));input.value='';save();draw()});draw();
}
function compile(spec={}){
 const kind=spec.kind||'landing',name=String(spec.name??'').trim(),description=String(spec.description??'').trim().slice(0,700),theme=spec.theme||'ice';
 if(!kinds.includes(kind))throw Error('KIND_INVALID');if(!name)throw Error('NAME_REQUIRED');if(name.length>90)throw Error('NAME_INVALID');if(!Object.prototype.hasOwnProperty.call(themes,theme))throw Error('THEME_INVALID');
 const [accent,bg,paper,ink]=themes[theme],key=localKey(name,kind);
 const style=[':root{color-scheme:',theme==='pearl'?'light':'dark',';--accent:',accent,';--bg:',bg,';--paper:',paper,';--ink:',ink,'}',
 '*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif}',
 'main{max-width:850px;margin:auto;padding:clamp(26px,7vw,76px) 22px 65px}',
 'mark{background:transparent;color:var(--accent);font-size:11px;letter-spacing:.2em;font-weight:700}',
 'h1{font-size:clamp(40px,8vw,72px);font-weight:580;line-height:1.06;letter-spacing:-.055em;margin:30px 0 19px}',
 'p{font-size:clamp(16px,2.6vw,20px);line-height:1.6;opacity:.85;white-space:pre-wrap}',
 '.panel{background:var(--paper);border-radius:22px;padding:24px;margin-top:35px;border:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}',
 'form{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}input[type=text],textarea{flex:1;min-width:170px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--ink) 22%,transparent);background:var(--bg);color:var(--ink);border-radius:11px;font:inherit}',
 'textarea{width:100%;min-height:130px}button{min-height:44px;padding:12px 16px;border:0;border-radius:10px;background:var(--accent);color:var(--bg);font:inherit;cursor:pointer;font-weight:650}',
 'button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:3px}',
 'ul{padding:0;list-style:none}li{display:flex;gap:13px;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 13%,transparent)}',
 'li label{display:flex;align-items:center;gap:12px;flex:1;overflow-wrap:anywhere}li input{width:18px;height:18px;accent-color:var(--accent)}li button{font-size:12px;background:transparent;color:var(--ink);border:1px solid color-mix(in srgb,var(--ink) 23%,transparent)}',
 'li p{font-size:15px;margin:0;flex:1;overflow-wrap:anywhere}footer{margin-top:50px;font-size:12px;opacity:.58;line-height:1.55}'].join('');
 const safeName=escapeHtml(name),safeDescription=escapeHtml(description);
 const content=kind==='tasks'?
 '<section class="panel"><h2>Задачи</h2><p id="taskCount" aria-live="polite"></p><form id="taskForm"><input id="taskInput" type="text" maxlength="180" placeholder="Что нужно сделать?" aria-label="Новая задача" required><button type="submit">Добавить</button></form><ul id="taskList"></ul><small id="storageStatus" role="status"></small></section>':
 kind==='notes'?'<section class="panel"><h2>Записи</h2><form id="noteForm"><textarea id="noteInput" maxlength="4000" placeholder="Запиши мысль…" aria-label="Новая запись" required></textarea><button type="submit">Сохранить</button></form><ul id="noteList"></ul><small id="storageStatus" role="status"></small></section>':
 '<section class="panel"><h2>Самостоятельный сайт</h2><p>Работает без облачных сервисов, внешних скриптов и подписок.</p></section>';
 const runtime=kind==='tasks'?taskRuntime:kind==='notes'?notesRuntime:null;
 const script=runtime?'<script>('+runtime.toString()+')('+JSON.stringify(key)+');</script>':'';
 const html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+safeName+'</title><style>'+style+'</style></head><body><main><header><mark>СОЗДАНО В MONDAYID</mark><h1>'+safeName+'</h1><p>'+safeDescription+'</p></header>'+content+'<footer>Автономное приложение, без сетевых зависимостей.'+(runtime?' Локальное сохранение зависит от браузера и способа открытия файла.':'')+'</footer></main>'+script+'</body></html>';
 return Object.freeze({kind,filename:slug(name)+'-'+kind+'.html',html,offline:true,externalDependencies:0});
}
root.MondayAppCompiler=Object.freeze({compile,kinds:Object.freeze(kinds)});
})(window);
