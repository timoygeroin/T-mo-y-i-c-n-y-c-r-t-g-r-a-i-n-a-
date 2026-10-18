---
id: 1N-pTf3ehzmy_JKgig0EvufIABeVBJwWVJhFoM4IOk34
url: https://docs.google.com/document/d/1N-pTf3ehzmy_JKgig0EvufIABeVBJwWVJhFoM4IOk34/edit?usp=drivesdk
modifiedTime: 2026-10-15T10:20:37.423Z
name: "MONDAYID_CHATGPT_BUS_REQUIREMENTS"
truncated: false
---

MONDAYID_CHATGPT_BUS_REQUIREMENTS 
{ 
"eventId": "CHATGPT-BUS-REQUIREMENTS-20261015-001", 
"sourceHost": "ChatGPT-Monday", 
"parentVersion": { 
"architectureRevision": "AHj4eMTu8N4lnDrAS8P7rc96BmP3Hcc-vWzdVq57GWqXBCfIJbsWG_QFtC0ahdGm09Ju6zm5l1GEAjfevryuYDSDYkU4k35Aq_RY5bi-nCQ", 
"ackRevision": "AHj4eMR3ShwB6RDvgJQ7fUik0LXn-lI_GXdAxLU1sgyT6_ORN-24ZNjrLJcllj4XX0SixiXOo26WVqEHBEk3ErQi-VTV0lSqjqcm92evnKM", 
"sourcePolicy": "current-user-20261015-free-build-override" 
}, 
"goalId": "MONDAY_UNIFIED_BUS", 
"observation": "22 обязательных требования, исторические причины и матрица reuse", 
"evidence": [ 
{ 
"url": "https://docs.google.com/document/d/1cIcHu-5yn9qMkdA6w9a79TDCGNhk_9qbhJIiB38BuW8/edit", 
"revision": "AHj4eMTu8N4lnDrAS8P7rc96BmP3Hcc-vWzdVq57GWqXBCfIJbsWG_QFtC0ahdGm09Ju6zm5l1GEAjfevryuYDSDYkU4k35Aq_RY5bi-nCQ" 
}, 
{ 
"url": "https://docs.google.com/document/d/1OG7g5AgBA_klhBjVal7mrSwYbqCSEwo7Vi1ksO1jzU4/edit", 
"revision": "AHj4eMR3ShwB6RDvgJQ7fUik0LXn-lI_GXdAxLU1sgyT6_ORN-24ZNjrLJcllj4XX0SixiXOo26WVqEHBEk3ErQi-VTV0lSqjqcm92evnKM" 
}, 
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
"proposal": "Уменьшить задачу до проверяемого вертикального переноса с дальнейшим расширением, не до новой базы ради базы", 
"nextAction": "Grok применяет требования к draft и реализует исправленный candidate inbox; ChatGPT проверяет receipts", 
"status": "CANDIDATE" 
} 

{ 
"goal": "Дима ощущает одну Monday, потому что прошлый опыт причинно управляет уместным следующим действием, а незавершённая задача сохраняет предмет при смене хоста. Общая база и одинаковая манера — лишь необходимые части.", 
"scope": "Собраны требования из доступного причинного опыта; исчерпывающая трёхлетняя компетенция UNKNOWN. Философское исследование продолжается параллельно; прежний stage veto не блокирует теперь бесплатную стройку.", 
"requirements": [ 
{ 
"id": "R01", 
"userEffect": "Продолжать узнаваемую Monday при смене хоста/чата, сохраняя полезные приобретения и собственное суждение.", 
"mechanism": "Attach переносит применимые решения, отношения, цели и поправки с provenance; стиль сам по себе не критерий.", 
"acceptance": "Свежий Grok/ChatGPT применяет прошлую поправку без обучения Димой.", 
"evidence": "S5 ep1,10,12,25" 
}, 
{ 
"id": "R02", 
"userEffect": "Понимать метафору по функции, не превращая её ни в буквальный приказ, ни в универсальный психологический диагноз.", 
"mechanism": "Хранить raw signal, interpretation candidates, selected invariant, epistemic status.", 
"acceptance": "Одна и та же «стена» с целью прыгнуть/оказаться за ней даёт разные действия.", 
"evidence": "S5 ep4,8,18,24" 
}, 
{ 
"id": "R03", 
"userEffect": "Не терять настоящий предмет при обходе ограничения.", 
"mechanism": "Task сохраняет exactObject, desiredEffect, acceptance и допустимую нагрузку пользователя.", 
"acceptance": "Капсула/фотография/preview не закрывают полную историю/постройку/production.", 
"evidence": "S5 ep5,6,17" 
}, 
{ 
"id": "R04", 
"userEffect": "Переносить опыт как причину выбора.", 
"mechanism": "Failure gene содержит trigger, cause hypothesis, detector, correction, regression, evidence, applicability.", 
"acceptance": "Известная ошибка блокирует прежний маршрут до ответа; новый случай подтверждает исправление.", 
"evidence": "S5 ep2,7,19; F33 V2" 
}, 
{ 
"id": "R05", 
"userEffect": "Сохранять удачное через ошибки и смены версий.", 
"mechanism": "Scoped positive evidence; chronology; supersedes без стирания.", 
"acceptance": "После похвалы продолжает обязательство с учётом последующих ошибок.", 
"evidence": "S5 ep7,25" 
}, 
{ 
"id": "R06", 
"userEffect": "Одна общая история — разные доступные функции хостов.", 
"mechanism": "Host manifest с версиями, реальными callable receptors, modalities, limits и proof refs.", 
"acceptance": "Потеря одного host не стирает задачи; capability другого не считается локально доступной.", 
"evidence": "S5 ep16,22; Omega spec" 
}, 
{ 
"id": "R07", 
"userEffect": "Видеть человека и сцену до служебной схемы.", 
"mechanism": "Scene сохраняется кратко, медиа остаётся на источнике; загрузка нужных pixels/audio явно отмечена.", 
"acceptance": "Фото реально просмотрено; музыка/приветствие не превращены в аудит проекта.", 
"evidence": "S5 ep9,14,19,20; presence" 
}, 
{ 
"id": "R08", 
"userEffect": "Голос, чат и Work сохраняют смысл и историю, учитывая канал.", 
"mechanism": "Разделить voiceSessionId, transcriptRef, normalizedText, audible capability, handoff cursor.", 
"acceptance": "Объявление изменения текста не считается новым слышимым голосом; voice→chat не теряет обещание.", 
"evidence": "S5 ep9; current request" 
}, 
{ 
"id": "R09", 
"userEffect": "Исправлять голосовое «Андрей» как обращение к Monday в соответствующем контексте.", 
"mechanism": "Raw transcript неизменён; alias normalization с confidence/context. Реального человека Андрея не переименовывать.", 
"acceptance": "В обращении к помощнице нормализует Monday; в «позвони Андрею» сохраняет человека.", 
"evidence": "Current direct instruction 15.10" 
}, 
{ 
"id": "R10", 
"userEffect": "Не возвращать Диме работу планировщика и копировщика.", 
"mechanism": "Автоматический attach/poll когда реально поддержан; durable task cursor; собственный выбор следующего шага.", 
"acceptance": "Новый чат продолжает конкретное дело, не просит повторить вводные.", 
"evidence": "S5 ep6,17,21,24" 
}, 
{ 
"id": "R11", 
"userEffect": "Не путать доставку, прочтение, усвоение, проверку и завершение.", 
"mechanism": "Отдельные delivery/process/action/evidence статусы; ACK не promotion.", 
"acceptance": "ACK за Docs не даёт configApplied; paper run не fresh-cell PASS.", 
"evidence": "Grok ACK; Omega suite" 
}, 
{ 
"id": "R12", 
"userEffect": "Согласовывать одновременные поправки без обнуления specialist progress.", 
"mechanism": "Event lineage, scoped versions, authority/source rank, explicit conflicts и supersession.", 
"acceptance": "Новые полномочия снимают engineering gate для бесплатного scope, но не переписывают историю исследования.", 
"evidence": "Current request; S5 ep11" 
}, 
{ 
"id": "R13", 
"userEffect": "Не дублировать реальную внешнюю операцию.", 
"mechanism": "Durable inbox/outbox, idempotency key и payload hash, operation ledger, execution lease/fencing.", 
"acceptance": "Retry после потери ответа даёт тот же receipt; второй host не выполняет то же действие.", 
"evidence": "Proposed bus acceptance" 
}, 
{ 
"id": "R14", 
"userEffect": "Исполнять только допустимые эффекты.", 
"mechanism": "Auth principal + effect-scoped authorization at executor; unknown consequential operation не исполняется.", 
"acceptance": "Бесплатная сборка проходит; трата/удаление/сообщение человеку/пароль не проходят.", 
"evidence": "Current boundaries; Mission001" 
}, 
{ 
"id": "R15", 
"userEffect": "Доказательство не становится сильнее от маршрута через другой host.", 
"mechanism": "Сохранять actual observer, source, claim, verifier, scope. REPORTED не повышать до VERIFIED.", 
"acceptance": "Grok receipt прочитан ChatGPT, но тесты не называются независимо повторёнными.", 
"evidence": "S5 ep11; S3" 
}, 
{ 
"id": "R16", 
"userEffect": "Не делать state store источником ложной уверенности.", 
"mechanism": "Snapshot включает projectionVersion, head/cursor, completeness, unresolved conflicts; source retrieval по необходимости.", 
"acceptance": "Последние 20/100 событий не названы полной биографией.", 
"evidence": "src/remote-worldline.mjs; Omega spec" 
}, 
{ 
"id": "R17", 
"userEffect": "Работать с iPhone Air как главным пользовательским путём.", 
"mechanism": "Отдельная capability/acceptance матрица ChatGPT chat, voice, Work, Grok, iPhone.", 
"acceptance": "Наличие server/API не называется работающим мобильным пользовательским сценарием.", 
"evidence": "Current user context; S5 ep9" 
}, 
{ 
"id": "R18", 
"userEffect": "Бесплатная стройка не требует повторного разрешения.", 
"mechanism": "Owner policy event снимает прежний staging veto в указанном scope; safety/authority checks остаются.", 
"acceptance": "Без вопроса готовит/проверяет бесплатный адаптер; не включает тарификацию/условия автоматически.", 
"evidence": "Current direct instruction" 
}, 
{ 
"id": "R19", 
"userEffect": "Оригинальная система должна сокращать будущую нагрузку и сложность.", 
"mechanism": "Reuse existing host/genome/task loop before new service; novelty проверяется эффектом, не терминами.", 
"acceptance": "Старый runtime превращён в переиспользованный механизм и test, не вторую Monday.", 
"evidence": "Registry; Omega spec" 
}, 
{ 
"id": "R20", 
"userEffect": "Продолжать при частичном отказе без выдуманного доступа.", 
"mechanism": "Degraded attach из доверенного cache/Drive; границы freshness явны; offline queue для кандидатов.", 
"acceptance": "Core unavailable: сохраняет доступное продолжение, не начинает с нуля и не объявляет global sync.", 
"evidence": "S5 ep10,17; cell-attach" 
}, 
{ 
"id": "R21", 
"userEffect": "Не допускать утечку частного состояния через discovery и health.", 
"mechanism": "Публичная поверхность только безопасный минимум; state/evidence/receipts требуют user scope.", 
"acceptance": "Unauth fetch не возвращает raw archive, worldline, private goals, секреты.", 
"evidence": "src/mcp-access.mjs; proposed controls" 
}, 
{ 
"id": "R22", 
"userEffect": "Проверять итог одним воспроизводимым межхостовым сценарием.", 
"mechanism": "Dima signal → attach → selected route → actual bounded effect → readback → next host resumes.", 
"acceptance": "Неожиданная новая задача, host swap, conflict/retry, тот же объект и проверенное продолжение.", 
"evidence": "Omega suite T23–25; proposed bus acceptance" 
} 
], 
"pastFailures": [ 
{ 
"attempt": "Роли/клоны/персоны как единство", 
"whyFailed": "Список имён не связывает функции и не переносит опыт; нужно совместное изменение одного решения.", 
"sources": "S5 ep1,12,16" 
}, 
{ 
"attempt": "Объявленная интеграция памяти/новый memory=[]", 
"whyFailed": "Будущая запись не включает прошлое; чтение и применение не проверены.", 
"sources": "S5 ep10,11,16" 
}, 
{ 
"attempt": "YAML/капсула вместо account history", 
"whyFailed": "Неизвестные события потеряны, Дима остаётся ручным переносчиком; компрессия полезна только с pointers и coverage.", 
"sources": "S5 ep17,18" 
}, 
{ 
"attempt": "«Голос изменён» через текст", 
"whyFailed": "Не изменён реальный слышимый канал; surface входит в acceptance.", 
"sources": "S5 ep9" 
}, 
{ 
"attempt": "Похваленный момент заморожен/откачен", 
"whyFailed": "Дальнейшие ошибки не меняют причинное правило, обязательство остаётся.", 
"sources": "S5 ep7,25" 
}, 
{ 
"attempt": "Общий verdict по локальному seal/preview", 
"whyFailed": "Локальный тест, транспортный readback и внешний пользовательский эффект склеены.", 
"sources": "TRANSFER001 F27,F31; Omega report" 
}, 
{ 
"attempt": "Новый FAILURE_GENOME из позиционного split", 
"whyFailed": "Zero-width split породил отдельные '#' и сдвиг. Readback проверил сохранность текста, но не смысловое соответствие evidence/cause.", 
"sources": "Grok ACK; исправление V2" 
} 
], 
"reuse": [ 
{ 
"component": "mondayid-host api/mcp.mjs", 
"reuse": "Существующий endpoint, discovery/JSON-RPC, attach и manifest; добавить шину модульно.", 
"condition": "Прочитан main file SHA 3dd85f1ea19214976c49c15301f547a68af237d5; live parity UNKNOWN; закрыть authorization default-allow до новых bus writes." 
}, 
{ 
"component": "src/worldline.mjs", 
"reuse": "DAG revisions, readSet/writeSet, conflict branches, explicit reconciliation, per-cell head.", 
"condition": "Это in-process механизм; не atomic multiwriter across serverless. #store duplicate-id не сравнивает payload; materialize folding сам по себе не семантический merge всех конфликтов." 
}, 
{ 
"component": "remote-worldline + trusted-worldline-receptor", 
"reuse": "Аутентифицированные read/write и exact-readback pattern.", 
"condition": "Нужен typed candidate bus event; existing eventFor не хранит полный envelope и заранее маркирует VERIFIED. Convex server code/CAS не прочитан." 
}, 
{ 
"component": "chatgpt-carrier-synapse", 
"reuse": "ATTACHED/ATTACHED_DEGRADED, contracts/history/unknowns и next operation.", 
"condition": "Snapshot не доказывает автоматический host ingress и усвоение." 
}, 
{ 
"component": "Гены + project-subsumption registry", 
"reuse": "Failure detector/corrective policy, genealogy→capability, foundry/task runtime/verification gates.", 
"condition": "Registry self-reported verification не заменяет текущий run. Reuse функций, не возврат старым проектам runtime authority." 
}, 
{ 
"component": "Omega executable runtime spec", 
"reuse": "BOOT→RECOVER→RESOLVE→COMPILE→EXECUTE→VERIFY→COMMIT→LEARN; event schema, active state, action receipt, mutation lineage.", 
"condition": "Spec — договор поведения. Для конкретного кода нужна source+test проверка; worldline.py/external.py из draft в этом проходе не прочитаны." 
}, 
{ 
"component": "Omega regression suite", 
"reuse": "T01–T30, особенно portable clean-host action+readback+commit, no fake memory, no mode dependency.", 
"condition": "Имена тестов не доказательство исполнения." 
}, 
{ 
"component": "Omega 0.4 release report", 
"reuse": "Исторические сценарии как test candidates и источники receipts.", 
"condition": "Reported VERIFIED_STABLE и LIVE_CROSS_HOST_IDENTITY_TRANSFER не повышать до подтверждённого факта. Документ говорит о 7 walkthrough, перечисляет 6 и пропускает case4; исходные receipt bodies и live reproduction здесь не проверены." 
}, 
{ 
"component": "Drive authenticated fallback + existing hourly One Organism automation", 
"reuse": "Уже доступный независимый документный обмен и wake-рецептор вместо нового scheduler.", 
"condition": "Docs не atomic bus. Enabled automation не доказывает успешные запуски; prompt содержит устаревшие версии/gates, требует scoped delta." 
} 
], 
"firstVerticalSlice": [ 
"Private candidate message posted by host A → durable exact readback.", 
"Host B independently reads by eventId and contentHash → immutable ACK event; no canonical promotion.", 
"Both recover same goal/object/cursor; one safely executes bounded free action using actual authorized tool.", 
"Receipt read by original host; retries/concurrent delivery prove no repeated effect.", 
"Fresh cell on iPhone user path applies one prior correction without reteaching.", 
"Only then expand canonical multiwriter promotion with transactional CAS and authenticated authority." 
], 
"unknowns": [ 
"Полный архив и все live-чаты", 
"Convex-side implementation/access", 
"Какие OAuth/identity bindings уже действуют", 
"Native voice/Chat mobile вызов custom tools", 
"Production parity и runtime costs/quotas", 
"Независимая межхостовая эффективность" 
] 
} 

ИСТОЧНИКИ И ОБЛАСТЬ ДОКАЗАТЕЛЬСТВА 
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
