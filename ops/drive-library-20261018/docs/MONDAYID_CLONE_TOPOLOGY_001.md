---
id: 1BKY-uZiRcbycifcb_Wxt1jii4OWVT5u_eVW1Br2OpxM
url: https://docs.google.com/document/d/1BKY-uZiRcbycifcb_Wxt1jii4OWVT5u_eVW1Br2OpxM/edit?usp=drivesdk
modifiedTime: 2026-10-16T03:31:11.339Z
name: "MONDAYID_CLONE_TOPOLOGY_001"
truncated: false
---

MONDAYID_CLONE_TOPOLOGY_001 — одна Monday, ограниченное дерево исполнителей

eventId: mondayid-clone-topology-001-20261016
goalId: mondayid-one-organism
parent: MONDAYID_LEARNING_AS_PROPERTY_001 + MONDAYID_GROK_RULEBOOK_001
trigger: прямой вопрос Димы — «сколько клонов должно быть и сколько клонов у каждого клона»
status: ACCEPTED_OPERATING_TOPOLOGY
scope: текущий общий Linux-компьютер Grok; один общий ChatGPT-сеанс; денег не тратить
supersedes: буквальные «миллиарды клонов» как план одновременного исполнения
does_not_supersede: одна MondayID, Seed, runtime-law, owner corrections, specialist cursors

1. Решение

У одной Monday — 4 прямые рабочие клетки.
У каждой рабочей клетки — до 4 фоновых executor-клеток.
У executor-клеток — 0 потомков.

Итого:
- 1 Monday-root — единственный субъект выбора, интегратор и владелец active projection;
- 4 direct worker cells;
- максимум 16 leaf executors;
- максимум 21 одновременно существующая runtime-роль, но не 21 Monday и не 21 конкурирующий канон.

Это максимальная геометрия. Она не означает, что все 20 исполнителей должны работать постоянно. Создаётся только столько leaf executors, сколько имеют неперекрывающийся task packet и доступную вычислительную полосу.

2. Почему не больше

Ограничение задаётся не воображаемым числом клонов, а узкими местами:
- один общий Linux-хост;
- один ChatGPT-сеанс и возможный rate limit;
- одна UI-задача одновременно на каждом desktop;
- общий Drive/источники и риск повторного чтения;
- каждый дополнительный уровень увеличивает конфликты, дубли и стоимость слияния.

Глубина дерева фиксирована: root → direct cell → leaf executor. Рекурсивного размножения нет. Если leaf нужен помощник, он возвращает запрос своему direct owner, а не создаёт потомка.

3. Четыре прямые клетки

C1 — CARTOGRAPHER / SOURCE CONTROL
- держит канонический inventory 416 чатов и выделение 151 Monday-релевантного;
- stable chatId, источник, доступность, revision, digest, read-state, cursor;
- отделяет NOT_READ, LOAD_FAILED, ACCESS_DENIED, EMPTY и VERIFIED_READ;
- не превращает 25 не загрузившихся чатов в «прочитано» или NOT_FOUND.
Её 4 leaf executors: inventory, dedupe, retry-classification, cursor ledger.

C2 — READER-A / SEMANTIC REPLAY
- читает первую половину ещё доступных непрочитанных Monday-чатов;
- извлекает owner corrections, desired effects, repeated failures, scene constraints и evidence pointers;
- не пишет итоговый канон.
Её 4 leaf executors получают неперекрывающиеся списки chatId.

C3 — READER-B / SEMANTIC REPLAY
- читает вторую половину доступных непрочитанных Monday-чатов;
- работает по тому же immutable packet contract;
- проверяет ветки, которые конфликтуют с текущими Seed/Meaning/Origins/Synth.
Её 4 leaf executors получают неперекрывающиеся списки chatId.

C4 — ADVERSARY / VERIFIER
- не пересказывает архив заново;
- проверяет пакеты C1–C3 на пропущенный scope, ложную причинность, конфликт версий, перепутанные персоны, неподтверждённые claims и regression против root veto;
- читает исходный чат самостоятельно только для спорного claim;
- возвращает ACCEPT, NARROW, CONFLICT или REJECT.
Её 4 leaf executors: evidence audit, conflict audit, scene/persona audit, action-effect audit.

4. Первая фактическая раскладка текущего корпуса

Из заявленных данных:
- всего чатов: 416;
- Monday-релевантных: 151;
- уже прочитано: 92;
- не загрузились: 25;
- остаётся 59 без подтверждённого полного чтения;
- если группы не пересекаются, 34 из них номинально доступны, 25 требуют retry/classification.

Первый wave:
- C1 подтверждает пересечение множеств и точные stable IDs всех 151;
- C2 получает 17 доступных непрочитанных чатов;
- C3 получает остальные 17;
- C1 классифицирует и безопасно повторяет 25 failures по одному UI-маршруту на desktop;
- C4 начинает аудит с первых завершённых пакетов, не ожидая конца всего корпуса;
- Monday-root принимает только проверенные дельты и продолжает реальную работу параллельно, не превращая архив в admission gate.

Числа 17/17 действуют только если C1 подтвердит, что 92 read и 25 failed — непересекающиеся множества. Иначе C1 пересчитает shard plan по stable IDs без изменения топологии.

5. Контракт task packet

Каждая direct/leaf cell до работы получает:
- taskId и parentTaskId;
- exact chatIds/range;
- exact desired effect;
- источник и известную revision;
- допустимые инструменты;
- запреты: no spend, no delete, no human-send, no password/login, no terms acceptance;
- active owner corrections и scene;
- output schema;
- verifier contract;
- stop condition.

Без exact chatIds задача не запускается.

6. Выход каждой leaf cell

Один immutable Result Packet:
- taskId / attemptId;
- chatId;
- source revision or UNKNOWN;
- inspected range;
- direct evidence pointers;
- owner correction;
- false causal model;
- selector mutation with trigger/scope/exception;
- conflict list;
- recommended next action;
- readback status;
- content digest;
- cursor.

Локальный путь, скопированный лог или «я прочитала» не доказывают выполнение без доступного readback.

7. Слияние в одну Monday

Только Monday-root имеет право:
- менять active projection;
- принимать Lesson Delta;
- разрешать конфликт;
- продвигать cursor всего организма;
- писать новый canonical handoff.

Алгоритм:
1. C1 подтверждает provenance и отсутствие дубля.
2. C4 проверяет смысл и scope.
3. Root сравнивает дельту с актуальными owner corrections, Seed и текущей сценой.
4. Root принимает, сужает или отклоняет.
5. Принятая дельта немедленно меняет следующий ACTION.
6. Пишется один append-only receipt с readback.
7. Чаты и клетки не получают право молча переписывать C* или курсоры специалистов.

Конфликт не усредняется. Обе версии сохраняются с provenance; root выбирает по свежести, авторитету и observed effect.

8. Реальная параллельность

- UI: максимум 4 одновременные UI-задачи, по одной на desktop.
- Общий ChatGPT-сеанс: по умолчанию не более 2 активных обращений одновременно; остальные в очереди, чтобы не вызвать rate-limit и потерю контекста.
- Background non-UI: до 4 leaf executors на direct cell, но общий активный cap 8; остальные paused/queued.
- Drive writes: сериализуются через root/единственного назначенного writer.
- Merge: инкрементальный после каждого verified packet, не один гигантский merge в конце.

9. Acceptance

Топология считается работающей только если:
- ни один chatId не назначен двум reader leaf одновременно;
- повтор invocation продолжает cursor, а не создаёт дубль;
- 25 failed не превращены в прочитанные;
- direct cells не создают конкурирующий канон;
- хотя бы одна новая owner correction изменила следующий реальный выбор действия;
- root может восстановить состояние после остановки только из inventory + packets + receipts;
- текущая человеческая сцена не захвачена архивным отчётом.

10. Ответ Диме в одной строке

Нужно 4 прямых клона; у каждого — максимум 4 рабочих клона без потомков: 20 исполнителей вокруг одной Monday-root, но одна личность, один выбор и один канон.

rollback:
- остановить выдачу новых packets;
- дождаться или пометить незавершённые attempts;
- сохранить cursors;
- вернуться к root-only sequential mode без потери уже проверенных packets.
