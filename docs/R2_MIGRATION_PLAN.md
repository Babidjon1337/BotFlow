# R2 — план совместимой миграции Bot lifecycle и Scenario

Статус: подготовлен до начала изменений БД.  
Дата: 27.08.2026.

## Цель

Ввести целевые понятия `scenario_type`, lifecycle бота и версионированный
payload сценария, не ломая работающий контур `BotConfig`, Telegram webhook и
JSON `funnel_schema`.

Этот документ не является миграцией и не меняет runtime-поведение.

## Аудит текущего состояния

| Текущая часть | Где находится | Ограничение для R2 |
|---|---|---|
| Бот | `bots` / `BotConfig` | `status` хранит только `draft`, `active`, `archived`. |
| Сценарий | `funnel_schema` JSONB | В данных уже встречаются legacy и V2 формы; удалять или переписывать их нельзя. |
| Готовность | `funnel_complete` и `evaluate_funnel_readiness` | Сохранённый boolean не является источником истины: сервис пересчитывает readiness. |
| Публикация | `/api/bots/{id}/toggle` | `active` означает установленный webhook, но одновременно несёт следы прежних license/PRO правил. |
| Остановка | `set_bot_status(..., "draft")` | В `draft` сворачиваются ручная остановка, неготовая воронка, замена токена и ограничение подписки. Причина теряется. |

## Целевой контракт

Новые поля добавляются рядом со старыми:

| Поле | Значения | Назначение |
|---|---|---|
| `scenario_type` | `sales_funnel` | Явный тип сценария. В v1 допускается только это значение. |
| `scenario_payload_version` | положительное целое | Версия payload выбранного сценария; не заменяет JSON-данные. |
| `lifecycle_status` | `draft`, `ready`, `published`, `paused`, `archived` | Единственное целевое состояние жизненного цикла. |
| `pause_reason` | nullable code | Причина `paused`: например `manual`, `readiness`, `subscription`, `integration`. |

`funnel_schema` остаётся payload сценария `sales_funnel` до отдельной
наблюдаемой миграции. `funnel_complete` остаётся временным compatibility-полем;
ReadinessService продолжает пересчитывать готовность с сервера.

## Backfill

Backfill должен быть идемпотентным и выполняться в той же транзакции, что и
заполнение новых полей:

| Legacy данные | `lifecycle_status` | `pause_reason` |
|---|---|---|
| `status = archived` | `archived` | `NULL` |
| `status = active` | `published` | `NULL` |
| `status = draft` и `funnel_complete = true` | `ready` | `NULL` |
| `status = draft` и `funnel_complete = false` | `draft` | `NULL` |

Для каждой записи: `scenario_type = sales_funnel`; `scenario_payload_version`
берётся из целого `funnel_schema.version`, а при legacy/отсутствующем значении
устанавливается в `1`. Backfill не изменяет webhook, токены, payment credentials,
`funnel_schema`, `status` или `funnel_complete`.

## Порядок безопасного внедрения

1. Зафиксировать contract-тесты текущих `/api/bots`, `/toggle`, `/funnel` и
   `/readiness` до миграции.
2. Добавить Alembic migration с nullable колонками, check constraints для enum
   значений и индексом `lifecycle_status`; выполнить идемпотентный backfill.
3. Добавить новые поля в модель и внутренний `BotLifecycleService` — глубокий
   модуль с узким интерфейсом `transition(bot, target, reason=None)` и
   `readiness(bot)`. Внутри него остаются проверки readiness, entitlement и
   Telegram adapter; роутеры не реализуют переходы сами.
4. На переходный период писать оба представления: `published → active`,
   `archived → archived`, остальные lifecycle-состояния → `draft`. Чтение
   предпочитает новые поля, но при `NULL` вычисляет legacy-значение.
5. Расширить DTO только аддитивно: сохранить `status`, добавить
   `scenarioType`, `scenarioVersion`, `lifecycleStatus`, `pauseReason` и
   readiness с машиночитаемыми `code` плюс нынешним user-facing `message`.
   Секреты и расшифрованные credentials не возвращать.
6. Перевести `/toggle`, сохранение воронки, token replacement и admin actions
   на `BotLifecycleService`; покрыть каждую причину паузы.
7. После наблюдаемого периода и подтверждения backfill удалить legacy write-paths
   отдельным релизом. Удаление `status` и `funnel_complete` не входит в R2.

## Инварианты и тесты gate

- Существующий клиент, читающий только `status` и `funnelComplete`, продолжает
  работать до отдельного deprecation-релиза.
- Непройденная серверная readiness не допускает `published`.
- Изменение token, ручная остановка, потеря права публикации и сбой интеграции
  сохраняют различимые `pause_reason`.
- Forward и downgrade Alembic migrations проходят на пустой и legacy базе;
  downgrade не меняет legacy-поля.
- Backfill повторно выполняется без изменения уже заполненных записей.
- OpenAPI/DTO tests проверяют отсутствие секретов и наличие стабильных
  машиночитаемых readiness codes.
- Integration tests покрывают `draft → ready → published → paused → archived`
  и обратные разрешённые переходы.

## Риски, не решаемые в этом шаге

- Старые `active` боты не доказывают наличие целевой bot-subscription: R2
  сохраняет факт публикации, а entitlement переносится в R3.
- Текущая оплата и касса принадлежат `BotConfig`; account-level
  `GatewayConnection` планируется как отдельная совместимая подзадача R2 после
  lifecycle-контракта.
- `status = draft` исторически не содержит причину остановки; backfill не
  выдумывает её и оставляет `pause_reason = NULL`.
