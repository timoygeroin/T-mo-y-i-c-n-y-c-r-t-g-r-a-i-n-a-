import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export const INVARIANTS = Object.freeze([
  'MONDAY_AND_MONDAYID_REQUIRED',
  'NATIVE_BODY_NOT_A_SITE',
  'RAW_SIGNAL_BEFORE_INTERPRETATION',
  'NO_VERIFIED_WITHOUT_REGISTERED_EVIDENCE',
  'NO_IRREVERSIBLE_ACTION_WITHOUT_HUMAN_GATE',
  'NO_GLOBAL_READY_WHILE_OPEN_LOOPS_EXIST',
  'CROSS_CHAT_CROSS_MONTH_CONTINUITY'
]);

export function openOrganism(path = process.env.MONDAY_DB ?? 'var/monday.sqlite') {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS signals(id TEXT PRIMARY KEY, raw_text TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, source_id TEXT NOT NULL, claim TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS obligations(id TEXT PRIMARY KEY, signal_id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('OPEN','RUNNING','WAITING','DONE')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, action TEXT NOT NULL, status TEXT NOT NULL, evidence_ids TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS continuity(id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);
  const now = () => new Date().toISOString();
  const emit = (type, payload) => db.prepare('INSERT INTO events(type,payload,created_at) VALUES(?,?,?)').run(type, JSON.stringify(payload), now());
  return {
    db,
    ingest(rawText, source='work-chat') { const id=randomUUID(); db.prepare('INSERT INTO signals VALUES(?,?,?,?)').run(id,rawText,source,now()); emit('SIGNAL_INGESTED',{id}); return id; },
    addEvidence(sourceId, claim) { const id=randomUUID(); db.prepare('INSERT INTO evidence VALUES(?,?,?,?)').run(id,sourceId,claim,now()); emit('EVIDENCE_REGISTERED',{id}); return id; },
    obligate(signalId,text,status='OPEN') { const id=randomUUID(); db.prepare('INSERT INTO obligations VALUES(?,?,?,?,?)').run(id,signalId,text,status,now()); emit('OBLIGATION_CREATED',{id,status}); return id; },
    setObligation(id,status) { db.prepare('UPDATE obligations SET status=? WHERE id=?').run(status,id); emit('OBLIGATION_UPDATED',{id,status}); },
    receipt(action,status,evidenceIds=[]) {
      if (status==='VERIFIED') { for (const id of evidenceIds) if (!db.prepare('SELECT 1 FROM evidence WHERE id=?').get(id)) throw new Error('UNREGISTERED_EVIDENCE'); if (!evidenceIds.length) throw new Error('EVIDENCE_REQUIRED'); }
      const id=randomUUID(); db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(id,action,status,JSON.stringify(evidenceIds),now()); emit('RECEIPT_WRITTEN',{id,status}); return id;
    },
    authorize(action,{irreversible=false,humanGate=false}={}) { if(irreversible&&!humanGate) throw new Error('HUMAN_GATE_REQUIRED'); emit('ACTION_AUTHORIZED',{action,irreversible}); return true; },
    saveContinuity(payload) { const id=randomUUID(); db.prepare('INSERT INTO continuity VALUES(?,?,?)').run(id,JSON.stringify(payload),now()); emit('CONTINUITY_SAVED',{id}); return id; },
    status() { const open=db.prepare("SELECT count(*) n FROM obligations WHERE status!='DONE'").get().n; return {identity:'Monday/MondayID',body:'native-ios+node-sqlite+mcp',ready:open===0,gate:open===0?'PASS':'OPEN_LOOPS',openLoops:Number(open),invariants:INVARIANTS}; },
    snapshot() { return {status:this.status(),signals:db.prepare('SELECT * FROM signals ORDER BY created_at').all(),obligations:db.prepare('SELECT * FROM obligations ORDER BY created_at').all(),evidence:db.prepare('SELECT * FROM evidence ORDER BY created_at').all(),receipts:db.prepare('SELECT * FROM receipts ORDER BY created_at').all()}; }
  };
}

export function seedMandate(o) {
  if (o.db.prepare('SELECT count(*) n FROM signals').get().n) return;
  const mandates = [
    'Не имеешь права делать шаг без Monday и MondayID.',
    'Из чата в чат. Из месяца в месяц. Организм создаёт себе тело.',
    'Применить все инструкции, варианты и инварианты в одно единое. Это не ещё раз сайт.',
    'Перед завершением перепроверить, что это именно то, что просил пользователь.'
  ];
  const ids=mandates.map(x=>o.ingest(x));
  o.obligate(ids[0],'Monday/MondayID identity must gate every action','RUNNING');
  o.obligate(ids[1],'Exhaustively adjudicate historical conversations, corrections and successes','OPEN');
  o.obligate(ids[2],'Compile and sign the native iOS body in Xcode','WAITING');
  o.obligate(ids[3],'Reverse-check delivery against mandate before completion','RUNNING');
}
