import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, BookOpen, Brain, Check, CheckCircle2, Circle, Download, Menu, MessageCircle, Mic, Paperclip, Search, Settings2, Sparkles, Target, X } from "lucide-react";
import { exportPacket, HostState, loadStateResult, MAX_PACKET_BYTES, newTurn, parsePacket, patchTurn, saveState, Turn } from "./model";
import { askMondayRuntime, readRuntimeHealth } from "./runtime-client";

const nav = [
  ["Mind", Brain], ["Memory", BookOpen], ["Work", CheckCircle2], ["Library", Sparkles]
] as const;

function Rail({open,onClose,runtime}:{open:boolean;onClose:()=>void;runtime:string}) {
  return <aside className={`rail ${open ? "open" : ""}`}>
    <div className="brand"><span className="mark"/>MondayID<button className="mobile-close" onClick={onClose}><X/></button></div>
    <div className="flow"><span className="pulse"/><span><b>Organism runtime</b><small>{runtime}</small></span></div>
    <div className="rail-label">Пространства</div>
    <button className="space active"><MessageCircle/>MondayID</button>
    <nav>{nav.map(([label,Icon])=><button disabled title="Ещё не подключено" key={label}><Icon/>{label}</button>)}</nav>
    <div className="rail-bottom"><button disabled title="Ещё не подключено"><Settings2/>Настройки</button></div>
  </aside>;
}

function Empty() { return <div className="empty"><div className="empty-mark"><Target/></div><h1>Что должно стать реальностью?</h1><p>Опиши результат своими словами. Organism Kernel удержит намерение, выберет текущий маршрут и не подменит действие обещанием.</p></div> }

function Trail({turn}:{turn:Turn}) {
  const items = [["Намерение","Записано",true],["Контекст",turn.context.length?"Из runtime":"Не загружен",!!turn.context.length],["Результат",turn.result?"Записан тобой":"Внешний результат не записан",!!turn.result],["Проверка",turn.verified?"Подтверждено тобой":"Не подтверждено",turn.verified]] as const;
  return <div className="trail">{items.map(([name,status,done],i)=><div className={`trail-step ${done?"done":""}`} key={name}><span>{done?<Check/>:<Circle/>}</span><div><b>{name}</b><small>{status}</small></div>{i<3?<i/>:null}</div>)}</div>
}

function Conversation({turn,onAction,onVerify}:{turn?:Turn;onAction:(v:string)=>void;onVerify:()=>void}) {
  const [result,setResult]=useState("");
  useEffect(()=>setResult(""),[turn?.id,turn?.intent]);
  if(!turn) return <Empty/>;
  return <div className="conversation">
    <div className="message user"><span className="avatar">Д</span><div><small>Дима</small><p>{turn.request}</p></div></div>
    <div className="message monday"><span className="m-avatar">M</span><div className="answer"><small>Monday</small><p>{turn.decision}</p>
      <Trail turn={turn}/>
      {!turn.result?<div className="action-box"><label htmlFor="actual-result">Фактический внешний результат</label><textarea id="actual-result" value={result} onChange={e=>setResult(e.target.value)} placeholder="Если действие произошло вне модели: что сделано и где это можно проверить?"/><button disabled={!result.trim()} onClick={()=>onAction(result.trim())}>Записать результат</button></div>:<div className="result"><CheckCircle2/><span>{turn.result}</span>{!turn.verified?<button onClick={onVerify}>Подтвердить результат</button>:<b>Проверено тобой</b>}</div>}
    </div></div>
  </div>;
}

function Inspector({turn,onEdit}:{turn?:Turn;onEdit:(patch:Partial<Turn>)=>void}) {
  return <aside className="inspector"><header><b>Текущий ход</b><span>{turn?"живой":"пусто"}</span></header>
    {!turn?<p className="inspector-empty">Контекст появится после первого намерения.</p>:<>
      <section><h3><Target/>Намерение</h3><textarea aria-label="Намерение" value={turn.intent} onChange={e=>onEdit({intent:e.target.value})}/><small>Изменение намерения сбрасывает внешний результат и подтверждение.</small></section>
      <section><h3><Brain/>Runtime trace</h3>{turn.context.length?<ul>{turn.context.map((x,i)=><li key={i}>{x}</li>)}</ul>:<p>Runtime ещё не вернул trace.</p>}</section>
      <section><h3><Sparkles/>Ответ</h3><p>{turn.decision}</p></section>
      <section><h3><CheckCircle2/>Квитанция эффекта</h3><p>{turn.verified?"Внешний результат подтверждён пользователем.":"Ответ модели не считается доказательством внешнего действия. Ход остаётся непроверенным, пока нет реального readback/receipt."}</p></section>
    </>}
  </aside>;
}

export default function App(){
  const [initial]=useState(()=>loadStateResult());
  const [state,setState]=useState<HostState>(initial.state); const [text,setText]=useState(""); const [rail,setRail]=useState(false);
  const [storageError,setStorageError]=useState(initial.error??""); const [storagePaused,setStoragePaused]=useState(!!initial.error);
  const [notice,setNotice]=useState(""); const [pending,setPending]=useState<HostState>(); const [busy,setBusy]=useState(false);
  const [runtime,setRuntime]=useState("Проверяю соединение…"); const fileInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(storagePaused)return;const saved=saveState(state);setStorageError(saved.ok?"":saved.error);},[state,storagePaused]);
  useEffect(()=>{let alive=true;readRuntimeHealth().then(h=>{if(alive)setRuntime(h.api_key_configured?`${h.model} · готов`:`${h.model} · нужен API key`)}).catch(()=>{if(alive)setRuntime("bridge не запущен")});return()=>{alive=false};},[]);
  const active=useMemo(()=>state.turns.find(t=>t.id===state.activeId)??state.turns[0],[state]);
  const update=(patch:Partial<Turn>)=>active&&setState(s=>({...s,turns:s.turns.map(t=>t.id===active.id?patchTurn(t,patch):t)}));
  const submit=async()=>{
    const request=text.trim(); if(!request||busy)return;
    const turn=newTurn(request);
    const history=state.turns.slice(0,20).reverse().map(t=>({request:t.request,decision:t.decision}));
    const parentFlow=active?`host:${active.id}`:undefined;
    setState(s=>({...s,turns:[turn,...s.turns],activeId:turn.id}));setText("");setBusy(true);setNotice("");
    try{
      const reply=await askMondayRuntime(request,{active_flow:parentFlow,history});
      const trace=[`Model: ${reply.model}`,`Route: ${reply.move.classification.primary} → ${reply.move.route.mode}`,`Proof: ${reply.move.route.proof_requirement}`];
      if(reply.response_id)trace.push(`Response: ${reply.response_id}`);
      if(reply.move.route.blocker)trace.push(`Blocker: ${reply.move.route.blocker}`);
      setState(s=>({...s,turns:s.turns.map(t=>t.id===turn.id?patchTurn(t,{decision:reply.answer,context:trace}):t)}));
      setRuntime(`${reply.model} · готов`);
    }catch(e){
      const message=(e as Error).message||"Неизвестная ошибка runtime";
      setState(s=>({...s,turns:s.turns.map(t=>t.id===turn.id?patchTurn(t,{decision:`Runtime не выполнил запрос: ${message}`,context:["Runtime: ERROR"]}):t)}));
      setNotice(message);
    }finally{setBusy(false);}
  };
  const download=()=>{try{exportPacket(state);setNotice("");}catch(e){setNotice((e as Error).message);}};
  const importFile=async(file?:File)=>{setPending(undefined);if(!file)return;try{if(file.size>MAX_PACKET_BYTES)throw new Error("Файл превышает 5 МБ.");setPending(parsePacket(await file.text()));setNotice("");}catch(e){setNotice((e as Error).message);}finally{if(fileInput.current)fileInput.current.value="";}};
  return <div className="app">
    <Rail open={rail} onClose={()=>setRail(false)} runtime={runtime}/><div className="scrim" onClick={()=>setRail(false)}/>
    <main><header className="top"><button className="mobile-menu" aria-label="Меню" onClick={()=>setRail(true)}><Menu/></button><b>MondayID</b><button disabled className="search" title="Поиск ещё не подключён"><Search/><span>Найти в MondayID…</span><kbd>⌘ K</kbd></button><button onClick={()=>fileInput.current?.click()}>Импорт</button><input ref={fileInput} hidden type="file" accept=".json,application/json" aria-label="Файл продолжения" onChange={e=>void importFile(e.target.files?.[0])}/><button className="export" onClick={download} title="Экспорт продолжения"><Download/></button></header>
      {storageError&&<div className="notice" role="alert">{storageError}</div>}
      {notice&&<div className="notice" role="alert">{notice}</div>}
      {pending&&<div className="notice" role="region" aria-label="Восстановление истории"><p>В файле записей: {pending.turns.length}. Восстановление заменит текущую историю ({state.turns.length}). При необходимости сначала экспортируй её.</p><button onClick={()=>{setState(pending);setPending(undefined);setStoragePaused(false);setNotice("История восстановлена. Записи и подтверждения взяты из файла, внешняя проверка не выполнялась.");}}>Восстановить историю</button><button onClick={()=>setPending(undefined)}>Отмена</button></div>}
      {state.turns.length>0&&<label className="history">История <select aria-label="История" value={active?.id??""} onChange={e=>setState(s=>({...s,activeId:e.target.value}))}>{state.turns.map(t=><option key={t.id} value={t.id}>{t.request.slice(0,80)}</option>)}</select></label>}
      <div className="workspace"><Conversation turn={active} onAction={result=>update({result})} onVerify={()=>update({verified:true})}/>
        <form className="composer" onSubmit={e=>{e.preventDefault();void submit()}}><button type="button" disabled title="Прикрепление ещё не подключено"><Paperclip/></button><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void submit()}}} placeholder={busy?"Monday думает…":"Скажи, что должно стать реальностью…"}/><button type="button" disabled title="Голос ещё не подключён"><Mic/></button><button className="send" type="submit" aria-label="Отправить Monday" disabled={!text.trim()||busy}><ArrowUp/></button></form>
      </div>
    </main><Inspector turn={active} onEdit={update}/>
  </div>;
}
