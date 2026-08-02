# Product Experience — Interface Inventory

Дата аудита: 2 августа 2026 года.

Статус: инвентаризация завершена, UI-код не изменён. Этот документ является единым источником истины для будущей унификации клиентского Mini App. Админ-панель учтена в карте компонентов, но исключена из ближайшей реализации по решению владельца продукта.

## 1. Резюме

В проекте уже есть пригодный фундамент дизайн-системы: semantic colors, light/dark theme, шкала radius и shadows, базовые `.btn`, `.card`, `.input`, `.badge`, типографические классы, safe-area и Telegram viewport. Наиболее зрелые реализации — `AlertProvider`, `FunnelLoadStateView`, состояния Dashboard и `MobileNav`.

Главная проблема — не отсутствие дизайна, а несколько параллельных визуальных и поведенческих языков. Большая часть экранов обходит базовые примитивы через локальные Tailwind-наборы и inline styles.

Статический срез:

- 114 нативных `button`, общего React-компонента Button нет;
- 30 `input`, из них 19 используют `.input`;
- 2 `contentEditable` rich-text редактора;
- 0 нативных `textarea`, `select`, `form` и `<dialog>`;
- 5 именованных Sheet-компонентов;
- 4+ реализации Switch;
- 4+ семейства Card;
- 5+ семейств Loading и минимум 3 Skeleton-композиции;
- 339 inline-style блоков;
- 41 использование `transition-all`;
- 49 прямых цветовых классов;
- более 20 вариантов status pill/chip при одном использовании `.badge`;
- более 20 вариантов shadow и не менее 22 вариантов radius;
- явный `focus-visible` системно задан только базовым `.btn/.input/.textarea`.

Зрелость текущей визуальной системы: **4,5/10**. Функциональный UI уже существует, поэтому полный редизайн не нужен. Нужна эволюционная унификация существующих решений.

## 2. Существующий фундамент, который нужно сохранить

- Tokens, темы, radius и shadows: `frontend/src/index.css:8-86`.
- Типографическая шкала: `frontend/src/index.css:238-282`.
- Базовые Card/Input/Button/Badge/Nav: `frontend/src/index.css:289-457`.
- Touch target 48 px и focus-visible базовых controls: `frontend/src/index.css:341-370`.
- Доступный blocking dialog с focus trap, Escape и focus restore: `frontend/src/components/AlertProvider.tsx:31-166`.
- Разделение loading/error и понятный retry: `frontend/src/components/FunnelLoadStateView.tsx:4-54`.
- Достоверные loading/error/stale/ready состояния Dashboard: `frontend/src/components/tabs/Home.tsx:804-994`.
- Semantic mobile navigation с `aria-current`: `frontend/src/components/MobileNav.tsx:27-82`.
- Переиспользуемый `EmptyBotState`: Build, Flow и BotManagement.
- Доменные компоненты `FunnelCard`, `PlanCard`, `BotSwitcher`, `DeliverySelector` и `TimerPresets` не следует превращать в универсальные компоненты без доказанного повторения.

## 3. Полная инвентаризация компонентов

| Категория | Текущие варианты и использования | Необоснованные различия | Отсутствующие состояния | Решение |
|---|---|---|---|---|
| Button | 114 экземпляров, минимум 14 визуальных семейств: `.btn` variants, `.btn-primary-saas`, gradient CTA, danger, text action, icon/close, segmented, menu/list/card actions | Primary, close и destructive actions выглядят и ведут себя по-разному | Единые loading, focus-visible, disabled, pressed, aria-busy | Укрепить существующую `.btn`-основу; затем один Button API и IconButton без изменения сценариев |
| Card | `.card`, `.card-saas`, `FunnelCard`, `PlanCard`, admin `Panel`, bespoke bordered/elevated surfaces | Radius 16/20/24/28+ и разные shadows без смыслового контракта | selected, interactive, disabled, loading, error | Оставить 3 низкоуровневых режима: surface, interactive, elevated; доменные cards сохранить |
| Input | 30 полей; `.input` — 19; отдельные checkout/search/admin варианты | Разные padding, border, focus, error и label pattern | help, error, success, disabled, readOnly, name/autocomplete/inputMode, label/error binding | Field + существующая Input foundation; SearchInput только для реально повторяемого сценария |
| Textarea | Нативных нет; `.textarea` объявлен, но не используется | Простые многострочные поля заменены contentEditable | disabled, readonly, error | Не вводить Textarea, пока нет реального простого multiline-сценария |
| Rich text | `RichTextEditor` в Build и `TariffDescriptionEditor` | Дублируются toolbar, bold/italic/strike, counter и contentEditable | Keyboard toolbar, accessible label, disabled/readOnly/error, единый limit | Объединить только общую основу RichTextField; media и доменную композицию оставить снаружи |
| Select | Нативного Select нет; provider cards и connected-chat list используются как выбор | Создание и настройки кассы повторяют selectable-card pattern | selected, disabled, loading, empty, error, radio semantics | ChoiceGroup/SelectableCard только после сверки одинаковой семантики; native Select не нужен автоматически |
| Checkbox | Custom hidden checkbox в BotCreate и нативный checkbox в Profile | Два несовместимых визуальных языка | Focus, error, indeterminate, disabled | Один Checkbox; «Пропустить платежи» сохранить checkbox, не превращать в switch |
| Switch | 4+: Payment delivery, installment, theme, bot status action | Разные размеры и семантика; часть без role/aria | Focus, disabled, loading, label | Один Switch для boolean settings; bot status оставить отдельным действием |
| Badge | CSS содержит 5 variants, `.badge` используется один раз | Статусы вручную собраны в 20+ pills | Единые semantic variants и contrast | Переиспользовать существующий Badge; не смешивать со clickable Chip |
| Chip | Timer presets, payment mode, delivery type и другие segmented buttons | Разная высота, selected state и семантика | Focus, disabled, aria-pressed/radio semantics | SegmentedControl для одинаковых single-choice групп; специализированные presets оставить композицией |
| Avatar | Минимум 5 семейств: bot initials, bot gradient, lead initials, modal lead, Telegram photo | Разные размеры, fallback и цветовая логика | Error fallback, loading, alt policy | Общая Avatar-основа с `src/fallback/seed/size`; bot/lead colors могут остаться доменными |
| Header | Global Header, page headers, 4+ sheet headers, modal headers | Разные close buttons, padding и title scale | Busy state, consistent semantics | Global Header оставить отдельно; унифицировать только SheetHeader/DialogHeader |
| Navigation | Sidebar, MobileNav, admin section nav | Desktop/mobile используют разные конфигурации; mobile не содержит Flow | Focus и единое правило видимости | Один источник nav configuration; desktop/mobile представление оставить разным |
| Tab | Формального Tabs нет; admin nav, delivery, payment mode, timer presets | Tabs и segmented controls визуально смешаны | tablist/tab/tabpanel либо aria-pressed contract | Tabs создавать только для настоящих панелей; выбор унифицировать через SegmentedControl |
| Sheet | BotCreate, BotSettings, BotSwitcher, Checkout, BillingRenew | 5 backdrop/z-index/radius/position/header/animation систем | Dialog semantics, Escape, focus trap/restore, busy, safe-area contract | Общие Overlay + SheetSurface + SheetHeader; бизнес-содержимое не объединять |
| Modal | Home client/invoice overlay, Subscription cancel, Admin UserDialog и другие bespoke overlays | Повторяется shell, close и backdrop | Dialog semantics, focus, Escape, focus restore | Переиспользовать доступный контракт AlertProvider в общем Dialog primitive |
| Dialog | AlertProvider — зрелая реализация; остальные modal-like surfaces слабее | Только AlertProvider близок к полному контракту | Background inertness для всего приложения | Blocking Alert и обычный Dialog оставить разными по назначению |
| Alert | AlertProvider: info/success/warning/danger; Funnel, Dashboard, Delivery и forms используют inline варианты | Icon/layout/action и семантика разъезжаются | Consistent live region и action slot | InlineAlert отдельно от blocking Dialog |
| Tooltip | Один `InfoTooltip`, 7 использований | Стили едины, но trigger — clickable div 18×18 | Keyboard, focus/blur, Escape, role=tooltip, aria-describedby, touch target | Улучшить существующий InfoTooltip; новый Tooltip не создавать |
| Dropdown | Bot action menu и BotSwitcher popover/dialog | Разные задачи ошибочно близки визуально | Arrow navigation, Escape, focus return, portal/layer contract | DropdownMenu только для action menu; BotSwitcher сохранить отдельным pattern |
| Empty State | EmptyBotState, empty leads, no search results, no connected chats | Разные размеры и CTA hierarchy | Единый compact/section contract | Лёгкий EmptyState primitive; EmptyBotState оставить продуктовой композицией |
| Loading State | App, lazy tab, Funnel, Dashboard, button spinners | 5+ семейств и 10+ локальных spinner variants | aria-busy/status, consistent copy, reduced motion | Spinner/SkeletonBlock/Button loading; экранные skeleton layouts оставить локальными |
| Skeleton | Funnel и Dashboard имеют минимум 3 композиции | Разные цвета и animation contract | Reduced motion и busy semantics | Унифицировать атом SkeletonBlock, не сами layout-композиции |
| Error State | Auth full-screen, Funnel, Dashboard, inline field, blocking alert | Разный уровень detail и CTA | Field binding, live semantics, retry contract | ErrorState для section/screen и FieldError для формы; Blocking Alert не заменять |
| Toast | Один Toast success/error, одно глобальное место | App хранит только строку, поэтому error может выглядеть как success | aria-live/status, keyboard close, wrapping, queue | Исправить существующий Toast и типизировать host; второй toast system не создавать |
| Form | 0 `<form>` при нескольких submit-сценариях | Все сценарии используют click handlers | Enter submit, form busy, validation summary | Переводить только законченные формы: create/settings/checkout/profile; без массового переписывания |
| Table | 2 таблицы, обе в mock-admin | Production repetition отсутствует | Caption, sort, empty/loading/error | Table primitive пока не создавать |
| List Item | Bot switcher, bot management, lead row, modal lead row, connected chat | Lead row продублирован в Home | selected, disabled, loading, menu action contract | Извлечь LeadListItem; универсальный ListItem пока преждевременен |

## 4. Ключевые места использования

### Buttons

- Foundation: `frontend/src/index.css:341-404`.
- Второй gradient primary: `frontend/src/index.css:163-181`.
- Payment CTA: `frontend/src/components/sheets/CheckoutSheet.tsx:149-166`.
- Разные close actions: `AlertProvider.tsx:132`, `BotSwitcher.tsx:52`, `CheckoutSheet.tsx:85`, `BillingRenew.tsx:63`.
- Разные destructive actions: `AlertProvider.tsx:163`, `BillingRenew.tsx:78`, `Subscription.tsx:677`.

### Inputs и rich text

- Foundation: `frontend/src/index.css:311-338`.
- Bot settings labels/inputs: `frontend/src/components/sheets/BotSettings.tsx:217-275`.
- Checkout email: `frontend/src/components/sheets/CheckoutSheet.tsx:112-129`.
- Dashboard search duplication: `frontend/src/components/tabs/Home.tsx:1005` и `Home.tsx:1315`.
- Build rich text: `frontend/src/components/tabs/Build.tsx:143-354`.
- Tariff rich text: `frontend/src/components/TariffDescriptionEditor.tsx:19-104`.

### Overlay surfaces

- Accessible reference: `frontend/src/components/AlertProvider.tsx:31-166`.
- Sheets: `BotCreateSheet.tsx:121-170`, `BotSettings.tsx:184-213`, `BotSwitcher.tsx:22-159`, `CheckoutSheet.tsx:61-159`, `BillingRenew.tsx:41-164`.
- Home full-screen overlay: `frontend/src/components/tabs/Home.tsx:1119-1390`.
- Subscription cancel modal: `frontend/src/components/tabs/Subscription.tsx:640-690`.

### Status and feedback

- Badge foundation: `frontend/src/index.css:407-429`.
- Funnel state: `frontend/src/components/FunnelLoadStateView.tsx:4-54`.
- Dashboard resource states: `frontend/src/components/tabs/Home.tsx:804-994`.
- Toast: `frontend/src/components/Toast.tsx:5-51`, host `frontend/src/App.tsx:433`.
- Tooltip: `frontend/src/components/InfoTooltip.tsx:20-211`.

## 5. Матрица состояний

| Состояние | Текущее покрытие | Вывод |
|---|---|---|
| Default | Почти везде | Сохранить |
| Hover | Широко, но бессистемно | Унифицировать только интерактивные families |
| Focus-visible | Надёжно только у `.btn/.input/.textarea` | P1 перед массовой миграцией |
| Active/Pressed | Есть примерно у половины controls | Нужен единый contract для Button/SegmentedControl |
| Disabled | Есть у основных async actions | Нужны единые opacity/cursor/reason semantics |
| Loading | Много локальных spinner variants | Нужен Button loading и aria-busy contract |
| Error | Визуально покрыт | Связь с полями и live semantics непоследовательна |
| Empty | Основные сценарии покрыты | Нужны только 2 уровня: compact и section/product |
| Skeleton | Dashboard и Funnel покрыты | Нужны общий atom и reduced-motion |
| Selected | Реализован локально | Стандартизировать для Choice/Segmented/Card |
| Stale | Хорошо реализован в Dashboard | Использовать как reference pattern |

## 6. Найденные correctness-проблемы до визуальной полировки

Это не повод для большого редизайна. Это небольшие или средние исправления, которые должны предшествовать декоративной унификации.

### P1 — визуальная и UX-достоверность

1. Используются отсутствующие tokens:
   - `--color-surface-3`: `Build.tsx:1554`, `1634`, `1691`; `Home.tsx:806-808`, `1096`;
   - `--color-surface-hover`: `Subscription.tsx:685`;
   - `--color-primary-rgb`: `Home.tsx:418`.
2. Sidebar имеет ширину 260 px, content offset — 240 px: `Sidebar.tsx:35`, `App.tsx:261`.
3. `App.css` не импортируется, хотя живой UI использует определённые только там `.custom-scrollbar` и React Flow rules: `main.tsx:3`, `Sidebar.tsx:87`, `Home.tsx:1193`, `1325`.
4. Error toast может выглядеть success, длинный текст не переносится: `App.tsx:433`, `Toast.tsx:42`.
5. Sheets и modal overlays, кроме AlertProvider, не имеют единого доступного dialog-контракта.
6. Rich-text toolbar частично работает только мышью; основной contentEditable не имеет полноценной textbox-семантики: `Build.tsx:214-249`, `344`; `TariffDescriptionEditor.tsx:51-93`.
7. В ручном выставлении счёта тариф выбирается через `<div onClick>`: `Home.tsx:1231`.
8. `BillingRenew` показывает статические карту/дату и неработающую «Сменить карту»: `BillingRenew.tsx:75`, `127-150`.
9. BotManagement показывает продажи/выручку как подтверждённый `0`, не различая отсутствие данных и ошибку: `BotManagement.tsx:405-415`.
10. Светлые semantic colors используются как мелкий текст и не всегда достигают WCAG AA. Нужны отдельные text-status tokens, не смена brand colors.

### P2 — системные состояния и доступность

- Labels в основном не связаны с inputs через `htmlFor/id`; нет единой `name/autocomplete/aria-invalid/aria-describedby` политики.
- Inline errors не имеют общего live/field-binding contract.
- `InfoTooltip` недоступен клавиатуре и имеет 18 px target.
- Dropdown menu не имеет Arrow/Escape/focus-return поведения.
- Close controls sheets преимущественно 32×32, ниже рекомендуемых 44×44 для Mini App.
- `prefers-reduced-motion` отсутствует.
- `frontend/index.html` запрещает zoom и содержит `lang="en"`, `<title>frontend</title>`.
- Theme toggle и часть switches не имеют полной switch semantics.

## 7. Экранная целостность

| Экран | Состояние | Что сохраняем | Что требует унификации |
|---|---|---|---|
| App shell | Рабочий | Header/Sidebar/MobileNav структура | Sidebar offset, nav source, page gutters, z-index scale |
| Dashboard/Home | Самый зрелый по data states | loading/error/stale contract | Снизить landing-like hero, унифицировать cards/buttons, убрать ложные values в связанных views |
| Build/Funnel | Функциональный, плотный | FunnelCard и доменная композиция | Rich text, controls, typography, spacing; только после primitives |
| Flow | Специализированный canvas | React Flow и node semantics | Восстановить реально нужные styles из App.css, не применять общий card layout |
| BotManagement | Рабочий | Domain actions/menu | Достоверность metrics, menu/dropdown states, cards/buttons |
| Profile | Рабочий | Information architecture | Inputs, checkbox/switch, inline styles, purple/admin accents |
| Subscription | Наиболее выбивается | Бизнес-сценарий и PlanCard domain | Уменьшить marketing intensity после token/primitives pass |
| Sheets | Рабочие сценарии | Содержимое и API calls | Общий overlay/header/dialog/focus/safe-area contract |
| Admin | Только inventory | Mock status явно обозначен | Не включать в текущий Product Experience scope |

## 8. Что объединять, а что не объединять

### Безопасные кандидаты на унификацию

1. Existing Button foundation + IconButton.
2. Field/Input + FieldError.
3. Checkbox и Switch как разные controls.
4. Badge и SegmentedControl как разные semantics.
5. Overlay/SheetSurface/SheetHeader и Dialog contract.
6. InlineAlert отдельно от blocking Alert/Dialog.
7. Spinner/SkeletonBlock и Button loading.
8. Avatar foundation.
9. RichTextField foundation для двух существующих редакторов.
10. LeadListItem — локальное доказанное дублирование.

### Не объединять без новой причины

- FunnelCard и обычный Card;
- PlanCard и обычный Card;
- EmptyBotState и компактный EmptyState;
- BotSwitcher и DropdownMenu;
- Tooltip и Dialog;
- Blocking Alert и InlineAlert;
- Skeleton layout разных экранов;
- все доменные list items в один универсальный ListItem;
- admin tables в преждевременный Table framework.

## 9. Рекомендуемый порядок Product Experience

### PX-0 — Visual correctness и trust

- исправить отсутствующие tokens и Sidebar offset;
- восстановить только нужные правила из неимпортируемого `App.css`;
- исправить Toast type/wrapping/live semantics;
- убрать ложные BillingRenew и BotManagement values;
- исправить zoom/lang/title;
- не менять композицию экранов.

### PX-1 — Tokens и states

- единый primary; отдельные contrast-safe status text tokens;
- radius/shadow/z-index scales;
- typography scale на существующих 400/500/600/700;
- explicit transitions и reduced motion;
- единый focus-visible contract.

### PX-2 — Existing primitives

- Button/IconButton;
- Field/Input/FieldError;
- Checkbox/Switch;
- Badge/SegmentedControl;
- InlineAlert/Toast;
- Overlay/Dialog/Sheet shell;
- Spinner/SkeletonBlock.

Миграция выполняется по одному существующему компоненту/экрану, без изменения business handlers и API calls.

### PX-3 — Shell и ключевые пути

- App shell и page rhythm;
- Dashboard;
- BotManagement;
- Profile и Settings;
- Build/Funnel;
- Subscription последней, после стабилизации продуктового языка.

### PX-4 — Visual polish

- ослабление лишних gradients/glow/oversized radii;
- responsive/keyboard/screen-reader QA;
- visual regression snapshots;
- только целевые motion improvements.

## 10. Правила будущей реализации

1. Не менять business logic, API calls и пользовательские сценарии в PR дизайн-системы.
2. До создания нового primitive доказать минимум два одинаковых использования либо обязательный accessibility contract.
3. Сначала расширять существующие `.btn/.card/.input/.badge`, затем мигрировать consumers.
4. Каждый компонент получает default, hover, focus-visible, active, disabled, loading и error/selected только там, где состояние применимо.
5. Static Badge не становится clickable Chip; boolean Switch не подменяет Checkbox.
6. Доменные components сохраняют названия и ответственность.
7. Один PR — один primitive или один экранный shell.
8. До и после каждого PR проверять 390 px, tablet и desktop, light/dark, keyboard, loading/error/empty.
9. Не импортировать legacy `App.css` целиком без проверки; переносить только реально используемые правила.
10. Admin не изменять до отдельного решения.

## 11. Итоговое решение

Инвентаризация завершена. Создавать новую UI-библиотеку с нуля не нужно. Оптимальный путь — укрепить существующие tokens и CSS primitives, затем тонко извлечь React wrappers только для доказанного повторения и accessibility contract.

Первый безопасный PR после принятия отчёта: **PX-0 Visual correctness и trust**, без визуального редизайна и без изменения бизнес-логики.
