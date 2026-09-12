import { useEffect, useMemo, useState } from "react";
import { ArrowUp, BookOpen, Brain, Check, CheckCircle2, Circle, Download, Menu, MessageCircle, Mic, Paperclip, Search, Settings2, Sparkles, Target, X } from "lucide-react";
import { exportPacket, HostState, loadState, newTurn, saveState, Turn } from "./model";

const nav = [
  ["Mind", Brain], ["Memory", BookOpen], ["Work", CheckCircle2], ["Library", Sparkles]
] as const;

function Rail({open,onClose}:{open:boolean;onClose:()=>void}) {
  return <aside className={`rail ${open ? "open" : ""}`}>
    <div className="brand"><span className="mark"/>MondayID<button className="mobile-close" onClick={onClose}><X/></button></div>
    <button className="flow"><span className="pulse"/><span><b>В потоке</b><small>Контекст рядом. Решение твоё.</small></span></button>
    <div className="rail-label">Пространства</div>
    <button className="space active"><MessageCircle/>MondayID</button>
    <nav>{nav.map(([label,Icon])=><button key={label}><Icon/>{label}</button>)}</nav>
    <div className="rail-bottom"><button><Settings2/>Настройки</button></div>
  </aside>;
}

function Empty() { return <div className="empty"><div className="empty-mark"><Target/></div><h1>Что должно стать реальностью?</h1><p>Опиши результат своими словами. MondayID удержит намерение, контекст и границу между действием и обещанием.</p></div> }

function Trail({turn}:{turn:Turn}) {
  const items = [["Намерение","Понято",true],["Контекст","Собран",true],["Действие",turn.result?"Выполнено":"Ожидает",!!turn.result],["Проверка",turn.verified?"Подтверждено":"Не подтверждено",turn.verified]] as const;
  return <div className="trail">{items.map(([name,status,done],i)=><div className={`trail-step ${done?"done":""}`} key={name}><span>{done?<Check/>:<Circle/>}</span><div><b>{name}</b><small>{status}</small></div>{i<3?<i/>:null}</div>)}</div>
}

function Conversation({turn,onAction,onVerify}:{turn?:Turn;onAction:(v:string)=>void;onVerify:()=>void}) {
  if(!turn) return <Empty/>;
  return <div className="conversation">
    <div className="message user"><span className="avatar">Д</span><div><small>Дима</small><p>{turn.request}</p></div></div>
    <div className="message monday"><span className="m-avatar">M</span><div className="answer"><small>Monday</small><p>{turn.decision}</p>
      <Trail turn={turn}/>
      {!turn.result?<div className="action-box"><label>Следующий точный ход</label><button onClick={()=>onAction("Ход выполнен и ожидает подтверждения результата.")}>Выполнить локальный ход</button></div>:<div className="result"><CheckCircle2/><span>{turn.result}</span>{!turn.verified?<button onClick={onVerify}>Подтвердить результат</button>:<b>Проверено тобой</b>}</div>}
    </div></div>
  </div>;
}

function Inspector({turn,onEdit}:{turn?:Turn;onEdit:(patch:Partial<Turn>)=>void}) {
  return <aside className="inspector"><header><b>Текущий ход</b><span>{turn?"живой":"пусто"}</span></header>
    {!turn?<p className="inspector-empty">Контекст появится после первого намерения.</p>:<>
      <section><h3><Target/>Намерение</h3><textarea value={turn.intent} onChange={e=>onEdit({intent:e.target.value})}/></section>
      <section><h3><Brain/>Контекст</h3><ul>{turn.context.map(x=><li key={x}>{x}</li>)}</ul></section>
      <section><h3><Sparkles/>Решение</h3><p>{turn.decision}</p></section>
      <section><h3><CheckCircle2/>Квитанция</h3><p>{turn.verified?"Результат подтверждён пользователем.":"Проверка ещё не получена. Система не считает ход завершённым."}</p></section>
    </>}
  </aside>;
}

export default function App(){
  const [state,setState]=useState<HostState>(()=>loadState()); const [text,setText]=useState(""); const [rail,setRail]=useState(false);
  useEffect(()=>saveState(state),[state]);
  const active=useMemo(()=>state.turns.find(t=>t.id===state.activeId)??state.turns[0],[state]);
  const update=(patch:Partial<Turn>)=>active&&setState(s=>({...s,turns:s.turns.map(t=>t.id===active.id?{...t,...patch}:t)}));
  const submit=()=>{if(!text.trim())return;const turn=newTurn(text);setState(s=>({...s,turns:[turn,...s.turns],activeId:turn.id}));setText("");};
  return <div className="app">
    <Rail open={rail} onClose={()=>setRail(false)}/><div className="scrim" onClick={()=>setRail(false)}/>
    <main><header className="top"><button className="mobile-menu" onClick={()=>setRail(true)}><Menu/></button><b>MondayID</b><button className="search"><Search/><span>Найти в MondayID…</span><kbd>⌘ K</kbd></button><button className="export" onClick={()=>exportPacket(state)} title="Экспорт продолжения"><Download/></button></header>
      <div className="workspace"><Conversation turn={active} onAction={result=>update({result})} onVerify={()=>update({verified:true})}/>
        <form className="composer" onSubmit={e=>{e.preventDefault();submit()}}><button type="button" title="Прикрепить"><Paperclip/></button><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit()}}} placeholder="Скажи, что должно стать реальностью…"/><button type="button" title="Голос"><Mic/></button><button className="send" type="submit" disabled={!text.trim()}><ArrowUp/></button></form>
      </div>
    </main><Inspector turn={active} onEdit={update}/>
  </div>;
}
