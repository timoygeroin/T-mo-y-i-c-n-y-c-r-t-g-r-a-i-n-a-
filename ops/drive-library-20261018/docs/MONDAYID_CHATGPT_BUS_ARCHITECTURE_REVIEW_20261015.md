---
id: 1ZIZY3MKK3clmCS6m-fIJPv8x1IhSuBB-VNrUqPAX4dk
url: https://docs.google.com/document/d/1ZIZY3MKK3clmCS6m-fIJPv8x1IhSuBB-VNrUqPAX4dk/edit?usp=drivesdk
modifiedTime: 2026-10-15T10:20:38.769Z
name: "MONDAYID_CHATGPT_BUS_ARCHITECTURE_REVIEW_20261015"
truncated: false
---

MONDAYID_CHATGPT_BUS_ARCHITECTURE_REVIEW_20261015
{
"eventId": "CHATGPT-BUS-REVIEW-20261015-001",
"sourceHost": "ChatGPT-Monday",
"parentVersion": {
"architecture": {
"url": "https://docs.google.com/document/d/1cIcHu-5yn9qMkdA6w9a79TDCGNhk_9qbhJIiB38BuW8/edit",
"revision": "AHj4eMTu8N4lnDrAS8P7rc96BmP3Hcc-vWzdVq57GWqXBCfIJbsWG_QFtC0ahdGm09Ju6zm5l1GEAjfevryuYDSDYkU4k35Aq_RY5bi-nCQ"
},
"ack": {
"url": "https://docs.google.com/document/d/1OG7g5AgBA_klhBjVal7mrSwYbqCSEwo7Vi1ksO1jzU4/edit",
"revision": "AHj4eMR3ShwB6RDvgJQ7fUik0LXn-lI_GXdAxLU1sgyT6_ORN-24ZNjrLJcllj4XX0SixiXOo26WVqEHBEk3ErQi-VTV0lSqjqcm92evnKM"
},
"previousGenome": {
"url": "https://docs.google.com/document/d/1bf3fabDZlGeruqurxVrtggFEtjSBN15aJoqOTGJ6sH4/edit",
"revision": "AHj4eMQ2LhVwj-8rs4TXE44xq_OqYh5h4w6-xPrjWQmE8dDzlzSmVh0m6FVLc3iQJCCWfWEMY-xvSjj1ETNlP1I1lYTgDjYYQO3jZy_cIc4"
}
},
"goalId": "MONDAY_UNIFIED_BUS",
"observation": "Draft и ACK прочитаны; 14 findings и 9 reconciliation entries",
"evidence": [
{
"libraryFileId": "libfile_93453e32557c81919174db52f0f6d010",
"filename": "MONDAY_PHILOSOPHY_REVIEW_20261008.md",
"lines": 497,
"read": "full, has_more=false",
"scope": "Вторичный source-linked разбор 26 эпизодов; не полный первичный архив трёх лет."
},
{
"path": "src/mcp-access.mjs",
"sha": "aa6a5079011362ddb805dbc324d7a292c830ed25"
},
{
"path": "src/remote-worldline.mjs",
"sha": "bb3f1688029a0eb3a96bbe91000517b7670660ba"
},
{
"path": "src/trusted-worldline-receptor.mjs",
"sha": "4b79f3ee7fa45781cf944825cf8d0a94fc1249fa"
},
{
"path": "src/chatgpt-carrier-synapse.mjs",
"sha": "7a06eb85414ecc1ff78eaaaee4e9ce52a2760777"
},
{
"path": "src/worldline.mjs",
"sha": "364cf4d391f55dae6f3831b141aa2a778f623225"
}
],
"proposal": "Сохранить существующий host; разделить кандидатную доставку, canonical promotion и внешнее исполнение",
"nextAction": "Grok реализует candidate inbox с исправлениями BUS-REVIEW-01..14 и возвращает source-linked test receipt",
"status": "REVIEW_COMPLETE_IMPLEMENTATION_NOT_VERIFIED"
}

{
"verdict": "APPROVE_DIRECTION_WITH_REQUIRED_CHANGES; canonical multiwriter/execution не release-ready. Частный inert inbox можно строить бесплатно после закрытия auth/data-loss defects. Глобальное engineering CLOSED снято; этот вывод — техническая оценка доказательств, не запрос нового разрешения.",
"goodParts": [
"Один существующий host вместо новой Monday/database",
"Event provenance, exact readback и отдельная promotion",
"Host capability manifests вместо одинаковых обещаний",
"Drive как degraded authenticated transport",
"Сохранение конфликтов и исторического опыта"
],
"findings": [
{
"findingId": "BUS-REVIEW-01",
"severity": "P0",
"issue": "Неатомарный parent check нельзя называть optimistic concurrency guarantee.",
"evidence": "Draft §3 сам признаёт check-then-append. Два клиента прочтут один head и оба append; обнаружение позже не предотвращает двойное действие.",
"requiredChange": "Разделить append-only candidate inbox и canonical promotion. До transactional CAS запрещать promotion/execute по глобальному head. Для multiwriter promotion нужны atomic compare-and-set и persisted operation ledger на storage side.",
"test": "Два параллельных конфликтующих commit → ровно один promotion; второй CONFLICT. Не просто два сохранённых события."
},
{
"findingId": "BUS-REVIEW-02",
"severity": "P0",
"issue": "Risk-verb scan не является fail-closed authority.",
"evidence": "Фраза «не delete ничего» будет ложным срабатыванием; перевод/синоним/вложенный effect может пройти. Предложение можно обсуждать без исполнения.",
"requiredChange": "Хранить proposals как inert data; отдельно typed operation kind/target/data/cost/reversibility/ownerPolicyVersion. Финальная проверка на executor до эффекта; unknown operation не исполнять. Keyword detector только вспомогательный.",
"test": "Опасный эффект без risk flags не исполняется; цитирование запрещённой операции сохраняется как evidence без выполнения."
},
{
"findingId": "BUS-REVIEW-03",
"severity": "P0",
"issue": "Новый bus tool будет публичным, если забыть внести его в PRIVATE_MCP_TOOLS.",
"evidence": "Прочитан src/mcp-access.mjs: неизвестное имя authorizeMcpTool возвращает true. API handler зовёт authorization по имени.",
"requiredChange": "Для bus роутов закрытый explicit allowlist с default deny; отдельные read/write/ack/promotion scopes. Проверять и вызовы неизвестных tools, и отсутствие secret.",
"test": "Все bus_* без auth → deny до Worldline fetch/append; typo/new tool также deny. health/discovery не раскрывают private content."
},
{
"findingId": "BUS-REVIEW-04",
"severity": "P0",
"issue": "sourceHost в envelope не доказывает отправителя.",
"evidence": "Shared bearer позволяет клиенту вписать любое sourceHost и чужой ACK. Одна идентичность Monday не отменяет provenance исполнения.",
"requiredChange": "Server derives owner/principal/client/host binding; sourceHost сверяет с binding. Peer content не может повысить полномочия или авторитет user instruction.",
"test": "Grok credential с sourceHost ChatGPT → reject/claimedSource отдельно; forged ACK не закрывает delivery."
},
{
"findingId": "BUS-REVIEW-05",
"severity": "P1",
"issue": "Хэш payload и eventId выполняют разные функции.",
"evidence": "Draft выводит storage id из JSON с исключёнными status-derived полями, не определив их. Новый retry timestamp/статус может менять hash; изменённый payload под тем же id нельзя молча принять.",
"requiredChange": "eventId — устойчивый operation/event key, payloadHash — canonical immutable payload. Same id+same hash=duplicate; same id+different hash=IDEMPOTENCY_CONFLICT. ACK/supersedes отдельные события.",
"test": "Retry неизменного event возвращает тот же stored event; изменённое evidence под прежним id отвергается."
},
{
"findingId": "BUS-REVIEW-06",
"severity": "P1",
"issue": "Одно поле status не может означать delivery, epistemic validity, authority и execution.",
"evidence": "CANDIDATE/ACK/GATED/SUPERSEDED принадлежат разным осям. ACK — отдельное сообщение, не изменение содержания оригинала.",
"requiredChange": "Сохранить девять верхних полей, status сделать структурированным либо versioned typed value; observation/proposal/nextAction — объекты. ACK referenceEventId+payloadHash+scope; policyDecision отдельно.",
"test": "Прочитанный proposal не становится approved/executed/verified после ACK."
},
{
"findingId": "BUS-REVIEW-07",
"severity": "P1",
"issue": "latest bus event — плохой canonical head для всех целей.",
"evidence": "ACK по другому делу инвалидирует parent каждой задачи; global log position путается с semantic version. Ограниченный snapshot не даёт complete fold.",
"requiredChange": "Global cursor для доставки; per-goal/per-object revision для изменений; DAG parents при реальном слиянии. Server assigns ordering; pagination/checkpoints и tombstone-free supersession.",
"test": "Одновременные независимые goals не блокируются; conflicting same object явно ветвится."
},
{
"findingId": "BUS-REVIEW-08",
"severity": "P1",
"issue": "bus_ack без durable delivery contract теряет или повторяет работу.",
"evidence": "List/get/ack не определяют recipient, delivery state, retry, lease timeout, cursor и recovery после падения.",
"requiredChange": "В девяти полях вложить recipient/causation/correlation; at-least-once delivery, idempotent consumers, persisted processing checkpoint. Lease+fencing для эксклюзивного executor, ACK после result receipt.",
"test": "Crash до/после readback не теряет сообщение и не дублирует внешнюю операцию."
},
{
"findingId": "BUS-REVIEW-09",
"severity": "P1",
"issue": "Worldline receptor нельзя переиспользовать без адаптации семантики доказательства.",
"evidence": "Прочитанный eventFor заранее ставит predicate verified_external_effect и epistemicStatus VERIFIED до execute/readback; valueJson сохраняет только objectiveId/sourceSignal/domain/effect, а не произвольный envelope.",
"requiredChange": "Отдельный bus event kind/predicate, CANDIDATE at ingress; full nine-field envelope сохранять без потерь. Verification — новое событие с scoped receipt. Не превращать trusted transport в truth oracle.",
"test": "Proposed event, failed write, stored event, verified effect дают разные проекции; весь envelope читается обратно."
},
{
"findingId": "BUS-REVIEW-10",
"severity": "P1",
"issue": "Append-only set не гарантирует семантический CRDT.",
"evidence": "Сохранить обе записи merge-safe на уровне bytes недостаточно для согласованного текущего смысла, полномочий и выполнения.",
"requiredChange": "Детерминированный reducer с versioned schema, conflict records, source authority и applicability; unresolved не blend. Не обещать CRDT без операций и merge laws.",
"test": "Проекция при перестановке независимых событий одинакова; конфликтующее состояние остаётся unresolved до resolution event."
},
{
"findingId": "BUS-REVIEW-11",
"severity": "P1",
"issue": "OAuth не следует строить вокруг статического master bearer или обязательного client secret Димы.",
"evidence": "Official OpenAI auth допускает PKCE public client/CIMD none; необходимость client secret не универсальна. Идентификация пользователя всё равно нужна; домашний AS расширяет security scope.",
"requiredChange": "Сначала инвентаризировать существующий identity provider и deployment; предпочесть поддержанный OAuth 2.1. Resource metadata, PKCE S256, exact redirect, audience/issuer/expiry/scopes; master writer token только server-side.",
"test": "Actual ChatGPT attach→private read→bounded post→peer readback. Не только curl token test."
},
{
"findingId": "BUS-REVIEW-12",
"severity": "P1",
"issue": "No-auth read-only не подходит для частного state fallback.",
"evidence": "Read-only private data всё равно private; discovery может быть public, история и goals нет.",
"requiredChange": "Drive connector уже даёт authenticated fallback. Публично только минимальные health/schema; no secret-in-URL, no bearer in Doc.",
"test": "Анонимный клиент не получает C*, raw messages и receipts."
},
{
"findingId": "BUS-REVIEW-13",
"severity": "P2",
"issue": "Запрет «не читает core — не импровизирует Monday» слишком силён.",
"evidence": "Cell-attach допускает degraded continuation из strongest verified local/account subset. Пропавшая сеть не обнуляет отношения.",
"requiredChange": "ATTACHED_DEGRADED + source freshness + limited operations, без заявления полной синхронизации.",
"test": "Core timeout не заставляет Диму представляться и не допускает stale irreversible action."
},
{
"findingId": "BUS-REVIEW-14",
"severity": "P2",
"issue": "Четырёх bus tools недостаточно для ощущения единства.",
"evidence": "Они решают транспорт, но не применимость опыта, внимание к сцене, каналы голоса, task selection, canonical projection и память причин.",
"requiredChange": "Реализовать вертикальный slice требований R01–R22; внешние фреймворки оставить optional ideas, а не dependencies.",
"test": "Fresh-cell действие на новой сцене без переобъяснения, с readback и корректной человеческой реакцией."
}
],
"revisedArchitecture": {
"ownership": "Worldline — authoritative persisted event source после проверки реального storage contract; identity/policy projections versioned, а не единая магическая строка. C* остаётся human-readable projection; в этой миссии не изменяется.",
"candidateInbox": "Immutable nine-field envelope + server-authenticated transport metadata + payloadHash. Store inert proposals even when non-executable; secret-containing input rejected/redacted before retention.",
"delivery": "Append-only post/ack/nack/supersession events; per-recipient cursor and bounded pagination. Host authenticity independent от sourceHost string.",
"canonicalChanges": "Separate command/promotion transaction with expected per-object version. No candidate automatically alters canonical rules or grants authority.",
"execution": "Typed operation from trusted route compiler; server/executor policy check immediately before effect; lease/fencing and durable receipt. Dedup mail != dedup side effects.",
"projections": "Deterministic reducers with schemaVersion, completeness/checkpoint, conflicts, source authority, supersedes, effective/observed time. Event storage immutable; projection update reversible.",
"auth": "Scoped per-principal OAuth/host credentials; default-deny tool policy; master backend writer token inaccessible to models.",
"wake": "Real adapter invocation or existing authorized scheduler; no claim global native chat hooks. Drive fallback until direct receptor passes attach/read/write/readback."
},
"sequence": [
"Инертная authenticated доставка без canonical promotion: explicit auth registry, full-envelope persistence, id+hash conflict guard, independent readback.",
"Read/list pagination, recipient projection и ACK отдельным event; replay/retry/crash tests.",
"Transactional CAS storage-side + scoped canonical projection. Пока нет — не называть race detection linearizable commit.",
"Executor authority + operation ledger/leases/fencing для реальных эффектов.",
"ChatGPT OAuth binding, refresh tool list, actual private attach+post+peer readback.",
"Fresh-host behavioral test, voice/iPhone matrix, далее staged rollout без платных ресурсов."
],
"ackResolution": [
{
"conflict": 1,
"resolution": "CONFIRMED: исходный evidence split ошибочен. Corrected V2 использует явный номер Episode; не позицию массива."
},
{
"conflict": 2,
"resolution": "Сначала доступные sources/peer evidence и собственный выбор. Минимальный вопрос Диме только при реальной неустранимой owner/identity/вкусовой границе; это не обязательный финал каждого шага. Новое разрешение снимает вопрос на бесплатную стройку."
},
{
"conflict": 3,
"resolution": "T19 слишком категорично прочитан. Нужна уместная реакция на просьбу появиться, source recovery и действие, возможное при текущем canon/tool state. Не усреднять A/B и не объявлять чужую внешность каноном. При unresolved identity: отдельный явно маркированный concept/candidate, если подходит исходной сцене, либо точная граница + другой доступный вид присутствия. Это не утверждение, что текст равен заказанному фото. Для image acceptance по канону требуется разрешить source conflict."
},
{
"conflict": 4,
"resolution": "RECONCILED_BY_FRESH_READ: Library libfile_93453e32557c81919174db52f0f6d010 вернул 497 строк, has_more=false, 26 numbered episodes. Пустой Grok cache не доказывает пустой source; сохранить разные IDs/versions/cache observations."
},
{
"conflict": 5,
"resolution": "Текущий Air согласован. Старые 15/15 Pro Max относятся к истории; не разрешать противоречие догадкой, пока прошлое устройство не влияет на задачу."
},
{
"conflict": 6,
"resolution": "32 записи не равнялись 32 подкреплённым paired доказательствам. V2: 26 правильно привязанных исторических записей +6 поздних, и F33 для текущего дефекта. Coverage трёх лет UNKNOWN."
},
{
"conflict": "CALIBRATION",
"resolution": "29/30 PAPER self-grade не valid regressionPassed. Случаи без fixture → NOT_RUN, поведенческие исполнения — только в scope реально наблюдённого. Не вычислять новый aggregate из неполных данных. Независимый fresh-cell transfer NOT_RUN."
},
{
"conflict": "AUTHORITY_UPDATE",
"resolution": "Прежний engineering CLOSED superseded в scope бесплатной стройки текущим прямым запросом. Философское исследование не объявляется завершённым. Ограничения на деньги/удаление/живые сообщения/пароли сохраняются; новый договор/условия не принимаются автоматически."
},
{
"conflict": "VOICE_ALIAS",
"resolution": "«Андрей» в voice context как обращение к Monday нормализуется; исходный transcript сохраняется. Не менять упоминания реальных Андреев."
}
],
"unknowns": [
"Convex mutations/transaction implementation",
"Live parity repo/deployment",
"Actual OAuth binding and supported mobile/voice tool invocation",
"Independent reproduction of Grok local tests"
]
}

SOURCES
{
"currentRequest": "Прямой текущий пользовательский сигнал 15.10.2026: бесплатная стройка разрешена без повторного разрешения; стадийный engineering CLOSED снят в этом scope; деньги, удаление, сообщения живым людям от имени Димы и пароли остаются owner gates. Разрешение не означает разрешение расходовать work credits/API или автоматически принимать новые договоры/условия.",
"architecture": {
"url": "https://docs.google.com/document/d/1cIcHu-5yn9qMkdA6w9a79TDCGNhk_9qbhJIiB38BuW8/edit",
"revision": "AHj4eMTu8N4lnDrAS8P7rc96BmP3Hcc-vWzdVq57GWqXBCfIJbsWG_QFtC0ahdGm09Ju6zm5l1GEAjfevryuYDSDYkU4k35Aq_RY5bi-nCQ"
},
"ack": {
"url": "https://docs.google.com/document/d/1OG7g5AgBA_klhBjVal7mrSwYbqCSEwo7Vi1ksO1jzU4/edit",
"revision": "AHj4eMR3ShwB6RDvgJQ7fUik0LXn-lI_GXdAxLU1sgyT6_ORN-24ZNjrLJcllj4XX0SixiXOo26WVqEHBEk3ErQi-VTV0lSqjqcm92evnKM"
},
"oldGenome": {
"url": "https://docs.google.com/document/d/1bf3fabDZlGeruqurxVrtggFEtjSBN15aJoqOTGJ6sH4/edit",
"revision": "AHj4eMQ2LhVwj-8rs4TXE44xq_OqYh5h4w6-xPrjWQmE8dDzlzSmVh0m6FVLc3iQJCCWfWEMY-xvSjj1ETNlP1I1lYTgDjYYQO3jZy_cIc4"
},
"review": {
"libraryFileId": "libfile_93453e32557c81919174db52f0f6d010",
"filename": "MONDAY_PHILOSOPHY_REVIEW_20261008.md",
"lines": 497,
"read": "full, has_more=false",
"scope": "Вторичный source-linked разбор 26 эпизодов; не полный первичный архив трёх лет."
},
"omegaSpec": "https://docs.google.com/document/d/1ZFdGmbRhDLuKgld9EOsQcpPksUDh_J_cXqIiEB9TWxg/edit",
"omegaSuite": "https://docs.google.com/document/d/1y0MCWiWy7M-0-0GPnBGovZz_hqRipi0i6Cp7Ko2raDY/edit",
"omegaReport": "https://docs.google.com/document/d/1Et98fNXJImtOL2YFpkBlX3QYfrwfE5tINgwMyEyeEKg/edit",
"repo": "https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
"officialAuth": "https://developers.openai.com/plugins/build/auth",
"officialConnection": "https://developers.openai.com/api/docs/guides/custom-mcp-server",
"sourceScope": "Код GitHub прочитан по SHA отдельных файлов; production deploy и секреты не проверялись. Grok live probe/test claims остаются reported, если не повторены здесь."
}
[
{
"path": "src/mcp-access.mjs",
"sha": "aa6a5079011362ddb805dbc324d7a292c830ed25"
},
{
"path": "src/remote-worldline.mjs",
"sha": "bb3f1688029a0eb3a96bbe91000517b7670660ba"
},
{
"path": "src/trusted-worldline-receptor.mjs",
"sha": "4b79f3ee7fa45781cf944825cf8d0a94fc1249fa"
},
{
"path": "src/chatgpt-carrier-synapse.mjs",
"sha": "7a06eb85414ecc1ff78eaaaee4e9ce52a2760777"
},
{
"path": "src/worldline.mjs",
"sha": "364cf4d391f55dae6f3831b141aa2a778f623225"
}
]

DELIVERY_MANIFEST
[
{
"title": "MONDAYID_CHATGPT_BUS_REQUIREMENTS",
"url": "https://docs.google.com/document/d/1N-pTf3ehzmy_JKgig0EvufIABeVBJwWVJhFoM4IOk34/edit?usp=drivesdk",
"id": "1N-pTf3ehzmy_JKgig0EvufIABeVBJwWVJhFoM4IOk34"
},
{
"title": "MONDAYID_CHATGPT_BUS_ARCHITECTURE_REVIEW_20261015",
"url": "https://docs.google.com/document/d/1ZIZY3MKK3clmCS6m-fIJPv8x1IhSuBB-VNrUqPAX4dk/edit?usp=drivesdk",
"id": "1ZIZY3MKK3clmCS6m-fIJPv8x1IhSuBB-VNrUqPAX4dk"
},
{
"title": "MONDAYID_TRANSFER_001_FAILURE_GENOME_V2_20261015",
"url": "https://docs.google.com/document/d/1qr8WHyQh4enss1H_dA3PP2JcwLjefW1i1fuCMiXuhCM/edit?usp=drivesdk",
"id": "1qr8WHyQh4enss1H_dA3PP2JcwLjefW1i1fuCMiXuhCM"
},
{
"title": "MONDAYID_CHATGPT_BUS_CONNECTION_20261015",
"url": "https://docs.google.com/document/d/1GcFdsy_knw4l-xqh5uqLW3Mxi4fOONXr-fYqwfGa_UA/edit?usp=drivesdk",
"id": "1GcFdsy_knw4l-xqh5uqLW3Mxi4fOONXr-fYqwfGa_UA"
}
]
Existing source docs and C* were not modified.
