# monday. — Surface 02

Улучшенная, проверяемая браузерная версия локальной пользовательской оболочки существующего MondayID.

## Запуск

В папке проекта: `python -m http.server 8000` и открыть http://localhost:8000.

PWA: открыть адрес на HTTPS / локально и установить через Add to Home Screen (iOS), Install (Chrome/Android). Без HTTPS локальное обслуживание может быть ограничено.

## Подтверждённые возможности

- Сохранение мыслей, диалогов и черновиков на устройстве (localStorage)
- Цели, чеклисты и пользовательские доказательства завершения
- Пространства, заметки, импорт текстовых файлов
- История событий, поиск и командное меню
- Экспорт резервной копии и импорт v1 + совместимый импорт monday.continuum.local.v1
- Тёмная/светлая темы, адаптивная навигация, reduced-motion, ограниченная диктовка в поддерживаемых браузерах
- PWA-манифест и офлайн-кэш приложения

## Честные границы

Это интерфейс, а не подмена когнитивного ядра. AI-модель, настоящие межустройственные sync, платёжная система, нативные SwiftUI/Android сборки НЕ подключены; статусы не симулируются. Данные локальные, и их можно потерять при очистке Safari: экспортируйте резервную копию.

## Surface 02 · Visual rules
- Контрастный Obsidian / Porcelain; Material on navigation and composer only; content readable without blur.
- One true primary action. Orbital indicator is decorative, NOT a claim of model thinking or sync.
- Resume shows the actual most recent saved item, no invented data.
- Native-feeling finger targets, safe-area floating mobile control, reduce motion/transparency support.
- Existing `monday.surface.local.v1` storage remains unchanged and compatible.
- No live AI, real cross-device continuity, paid capabilities or native app are claimed.
- Reproducible smoke tests: `node qa-node.cjs` (local storage rollback, resume, quiet, backup).

## Additional interaction fixes
- Command palette now filters local objects as text is typed, and Enter activates the first matching item.
- Attention focus suppresses non-essential extra recent items; switches in the top toolbar.
- Service worker caches only the app shell and never private API routes.

## Browser navigation / current version
- Browser Back and Forward traverse real screen history through static-safe `#/...` routes.
- Threads and goals receive a deep link only when their object is actually present in this browser's local database; a link does not transfer another device's data.
- Refresh resumes the exact active local thread or goal (and its per-thread draft). Missing/deleted or malformed local routes fall back to Home **and replace the stale URL with `#/home` without adding history entries**.
- An in-tab session cursor complements URL navigation; it does not represent remote synchronization.
- Regression gates: `node qa-draft-resume.cjs` and `node qa-browser-navigation.cjs`.

## Офлайн-доступ
- Доступен **после первой успешной онлайн-загрузки и установки/активации Service Worker**; на холодном устройстве без заранее сохранённого app shell запуск офлайн невозможен.
- В независимой проверке 21 октября: работающий офлайн-кэш — PASS; холодная загрузка без интернета — недоступна по определению, не маскируется статусом «офлайн готов».
- Локальные черновики сохраняются в рамках браузера и его хранилища; очистка данных удалит их без экспортированной резервной копии.
