# R3 — исследование рынка и черновик pricing architecture BotFlow

Статус: **PROPOSAL / требует утверждения владельцем продукта**.
Дата проверки официальных источников: **27.08.2026**.
Этот документ не меняет billing, checkout, entitlement или публичные цены.

## 1. Неподвижные правила продукта

- Подписка принадлежит конкретному `Bot`, а не `Account` и не общему пулу ботов.
- Бесплатно можно собирать и тестировать draft; оплачивается публикация конкретного бота.
- Цена бота раскладывается в UI без скрытой математики:

  `базовый пакет бота + дополнительные платформы + редкие платные модули + внешний usage = итог за период`.
- `Offer`, сценарий, `Broadcast`, аудитория и активный gateway относятся к конкретному боту.
- `GatewayConnection` не является товаром: подключение платёжного провайдера само по себе не увеличивает цену.
- Лиды, подписчики, сообщения, сценарии и оборот не становятся базовыми units of billing.
- Первая доступная платформа входит в базовую подписку. Доплата возникает только за вторую и последующие одновременно активные платформы.
- VK/MAX нельзя продавать до появления рабочего adapter/capability.

## 2. Конкуренты: актуальные официальные условия

Цены ниже указаны в валюте и виде официального источника. Акции отделены от регулярных цен. Если источник не публикует overage или годовой вариант, это отмечено без предположений.

| Сервис | Модель и главный unit | Базовая цена и состав | Лимиты и доплаты | Overage, год и рост |
|---|---|---|---|---|
| [SaleBot](https://docs.salebot.pro/nashi-uslugi/tarify) | Подписка **на конкретный проект**, capability-tier; add-ons каналов и сотрудников | Free 0 ₽; «Бизнес» 2 999 ₽/мес; «Инфобиз» 3 999 ₽/мес. Платные: builder, рассылки, интеграции/API, аналитика, платежи; «Инфобиз» добавляет курсы/трансляции и профильные интеграции | Free: 50 сообщений/сутки, без рассылок; платные: 10 000 сообщений и 1 000 email/сутки. По одному мессенджеру каждого типа; дополнительный мессенджер 649 ₽/мес, сотрудник 599 ₽/мес, платное хранилище | Денежный overage сообщений не опубликован. Год −15%. Рост: capability-tier, дополнительные каналы/сотрудники/storage. Upgrade возможен доплатой до конца периода |
| [BotHelp](https://bothelp.io/ru/pricing) | Workspace по числу **активных подписчиков во всех каналах**; боты, каналы, сотрудники и сценарии не тарифицируются | START 14 дней до 3 000 подписчиков; Creator 1 599 ₽/мес для 1 Instagram; Pro от 1 599 ₽/мес; Scale от 29 990 ₽/мес. Pro включает каналы, builder, рассылки, интеграции, аналитику, API, 150 000 AI-токенов | Pro: ступени 1K–100K+ активных подписчиков. AI/storage: Light 499 ₽, Boost 1 599 ₽, Ultra 7 999 ₽/мес | При превышении tier обновляется на следующей оплате без остановки. 6 мес −15%, 12 мес −25% при оплате по счёту от 20K подписчиков. Рост: аудитория, AI, storage |
| [PuzzleBot](https://puzzlebot.top/price?lang=ru) | Bundle: число ботов/ресурсов + подписчики + сложность builder | Free 0 ₽; Creative 891 ₽ с автоплатежом / 990 ₽ без; Advanced 1 521 / 1 690 ₽; Professional 2 691 / 2 990 ₽ в месяц | Free: 1 бот, 2 ресурса, 150 подписчиков/бот, 15 команд, branding; Creative: 2/3, 1K, 100; Advanced: 4/6, 10K, 200; Professional: 8/12, 20K, 400 | Денежный overage не опубликован: рост ведёт на следующий tier. 3 мес −10%, 6 мес −15%, 12 мес −20%. Автоплатёж дешевле |
| [Botmother](https://botmother.ru/price) | Account-tier по числу **рабочих ботов**; full functionality и unlimited users/messages | Test 0 ₽: до 10 тестовых ботов, по 5 тестировщиков. Starter 4 399 ₽/мес за 1 рабочий бот (первые 2 месяца для новых — акция 1 990 ₽); Advanced 14 999 ₽ за 5; Professional 16 499 ₽ за 10 | На рабочих ботах нет лимитов пользователей и сообщений. Custom development/infrastructure — индивидуально | Overage не опубликован; рост ведёт на bot-tier. Год: 43 990 / 149 990 / 164 990 ₽, экономия до 16%. Рост: рабочие боты и enterprise |
| [ChatPlace](https://chatplace.io/ru/pricing/index.html) | Plan + число подключённых **соцаккаунтов/ботов**; AI — credits | Free 0 ₽; Pro 2 000 ₽/мес; Creator 4 500 ₽; Premium 25 000 ₽. Core automations, bots, broadcasts включены. Free — 200 active contacts и branding; платные — unlimited contacts, без branding | В Free/Pro/Creator включён 1 аккаунт/бот; extra для Pro/Creator — 2 000 ₽ помесячно или 1 600 ₽/мес на годовом плане. Creator: 2 500 AI credits; Premium: 20 000 и unlimited accounts | AI credits докупаются. Год −20%: Pro 19 200 ₽, Creator 43 200 ₽, Premium 240 000 ₽. Рост: подключённые аккаунты и AI, не contacts/team |
| [Manychat](https://manychat.com/pricing) | Free/Pro/Elite; Pro автоматически масштабируется по **contacts** | Геолокализованная страница показала Free R$0 до 1 000 contacts; Pro от R$149/мес; Elite custom. Pro: расширенные каналы, growth tools, segments, analytics, integrations, no branding | AI add-on R$299/мес. WhatsApp — provider conversation fee поверх Pro; email включён до `contact limit × 10`, затем R$0,03/email; SMS через Twilio | Contact-tier выбирается автоматически, цена prorate по времени в tier. Годовой вариант на доступной странице не опубликован. Рост: contacts, AI и provider usage |

### Выводы

1. Ближайшие аналоги BotFlow — project pricing SaleBot и account/bot add-on ChatPlace, но BotFlow считает один конкретный бот.
2. Contact pricing извлекает revenue из роста, но ухудшает предсказуемость и противоречит обещанию BotFlow не ограничивать лиды/сообщения.
3. Botmother подтверждает спрос на unlimited-бот, однако её регулярный вход заметно выше подходящего старта BotFlow.
4. AI, storage, WhatsApp/SMS/email и dedicated infrastructure оправданы как отдельные позиции из-за реальной переменной себестоимости. Базовые действия продукта — нет.
5. Годовая скидка рынка — примерно 15–25%; «12 месяцев по цене 10» проще процентов.

## 3. Pricing architecture BotFlow

### 3.1 Формула

Для каждого `bot_id` создаются отдельные quote и subscription:

```text
monthly_bot_price = base_bot_package
                  + sum(additional_active_platforms)
                  + sum(enabled_paid_modules)
                  + explicit_external_usage
                  - gift_coverage
```

`Account` показывает сумму независимых bot subscriptions лишь как агрегат. Он не получает общий тариф, общий лимит или pool платформ.

### 3.2 Базовый пакет каждого бота

- публикация одного бота на одной доступной платформе;
- funnel/scenario builder и стандартные блоки;
- `Offer`, checkout-сценарии и приём платежей;
- несколько `GatewayConnection` на аккаунте и один активный gateway бота;
- audience, сегменты, `Broadcast` и базовая аналитика;
- webhooks/API, импорт/экспорт конфигурации, системный журнал;
- неограниченные лиды, подписчики, сообщения, Offers и сценарии в рамках технического fair use;
- обновления и стандартная поддержка.

### 3.3 Допустимые платные модули

Только capability с самостоятельной ценностью или измеримой себестоимостью:

| Модуль | Когда продавать | Цена в варианте B |
|---|---|---:|
| AI Automation | После рабочего AI capability, meter и прозрачного hard limit | 990 ₽/бот/мес: 1 000 AI actions; prepaid pack 1 000 actions — 490 ₽ |
| High-load / SLA | После измеримых throughput guarantees, отдельной очереди и SLA | Custom; не показывать как self-service до реализации |
| Внешний платный канал | Только если provider сам берёт usage fee | pass-through по тарифу provider без скрытой наценки либо с явно показанной service fee |

Не являются add-ons: `Offer`, число товаров/цен, Broadcast как функция, число получателей, gateway connections, платёжные провайдеры, базовая аналитика, webhooks/API, сегменты, сотрудники, шаблоны, сценарии, команды/условия, лиды, подписчики, сообщения и оборот.

## 4. Три модели

| | A — максимально простая | B — сбалансированная | C — максимизация ARPU |
|---|---:|---:|---:|
| База: 1 бот + 1 платформа | 990 ₽/мес | **1 490 ₽/мес** | 2 490 ₽/мес |
| Дополнительная активная платформа | 490 ₽/мес | **590 ₽/мес** | 790 ₽/мес |
| Core capabilities | всё включено | всё включено | core включён, premium пакетируются |
| AI Automation | prepaid usage после реализации | **990 ₽/мес + prepaid overage** | 1 490 ₽/мес, больший pool |
| Advanced analytics/API | включено | **включено** | 990 ₽/мес |
| Priority support | стандартная | стандартная; SLA custom | 790 ₽/мес |
| Audience/messages | unlimited/fair use | **unlimited/fair use** | tiers либо fair use |
| Годовая база | 9 900 ₽ | **14 900 ₽** | 24 900 ₽ |
| Сильная сторона | лучший entry price | ясная цена и здоровый ARPU | высокий expansion revenue |
| Риск | слабая unit economics | нужна дисциплина infrastructure cost | фрагментация и «плата за кнопку» |

## 5. Рекомендация: вариант B

Рекомендуется **1 490 ₽ за конкретный бот в месяц; одна платформа включена; каждая следующая +590 ₽**.

- Цена рядом с доказанным входом рынка (BotHelp 1 599 ₽; PuzzleBot 990–1 690 ₽), но unit понятнее — рабочий бот.
- Она ниже Botmother 4 399 ₽ за unlimited-бот и оставляет пространство для роста после подтверждения retention.
- Сохраняет прозрачность ChatPlace «план + подключение», но не копирует account-level модель.
- Не создаёт налог на рост аудитории.
- В конфигураторе итог объясняется тремя строками; будущий AI не маскируется внутри тарифа.
- Несколько ботов естественно увеличивают MRR: каждый имеет собственную ценность и lifecycle.

| Конфигурация конкретного бота | Расчёт | Итого/мес |
|---|---:|---:|
| Telegram | 1 490 | 1 490 ₽ |
| Telegram + VK | 1 490 + 590 | 2 080 ₽ |
| Telegram + VK + MAX | 1 490 + 590 + 590 | 2 670 ₽ |
| Telegram + VK + MAX + AI | 1 490 + 590 + 590 + 990 | 3 660 ₽ |

Пока реализован только Telegram, коммерчески доступна только первая строка. VK/MAX показываются как `Soon` и не попадают в quote.

## 6. Политики модели B

| Тема | Предлагаемое правило |
|---|---|
| Лимиты | Нет коммерческих лимитов лидов, подписчиков, сообщений, recipients, сценариев и оборота. Опубликованный fair use защищает инфраструктуру, но не создаёт автоматический счёт |
| Overage | Нет постоплатного overage. AI/provider usage: allowance + заранее купленные пакеты; по исчерпании hard stop только функции |
| Год | 12 месяцев по цене 10: −16,67%, вся сумма заранее. Скидка для базы, платформ и fixed modules; не для usage/pass-through |
| Prorate upgrade | Платформа/модуль включаются сразу; списывается точная доля до `current_period_end`. Quote показывает период, сумму и новую renewal price |
| Downgrade | На следующий renewal, без возврата за текущий период. Последнюю платформу published-бота удаляют только после pause/unpublish |
| Gift Grant | Один grant покрывает базовую подписку одного совместимого `bot_id` навсегда и одну платформу. Add-ons/AI/usage отдельно. Не продаётся и не переносится пользователем; admin может исправить ошибочную активацию |
| Lifetime | Публично не продавать. Только grandfathered legacy entitlement и административный Gift Grant; account-wide slot не возникает |
| Grace period | 7 дней после failed renewal; уведомления сразу, +1, +3, +6 дней. На 8-й день pause только этого бота с reason `subscription`; config/data сохраняются. После оплаты auto-resume |
| Возврат | До юридического решения не обещать. Хранить immutable invoice/quote snapshots и поддержать provider full/partial refund |
| Налоги/чек | Региональный catalog; до подтверждения всегда показывать окончательную сумму |

## 7. Pricing catalog

### `PricingCatalog`

- `catalog_id`, `version`, `status`, `effective_from/to`;
- `region`, `currency`, `tax_mode`, `prices_include_tax`;
- `monthly_anchor`, `annual_discount_rule`;
- `proration_policy`, `downgrade_policy`, `grace_policy`;
- `published_at`, `supersedes_catalog_id`.

### `PriceItem`

- `item_code`, `item_kind` (`base`, `platform`, `module`, `usage_pack`, `provider_pass_through`);
- `platform_code` / `module_code`, `capability_code`;
- `amount_minor`, `billing_period`, `included_quantity`;
- `meter_code`, `allowance`, `hard_limit`, `overage_mode`;
- `eligibility_rule`, `availability_status`;
- `display_name`, `display_reason`, `sort_order`.

### Quote/subscription snapshot

- `bot_id`, `catalog_version`, `configuration_hash`;
- выбранные items с количеством и суммой;
- subtotal, discount, tax, total в minor units;
- `current_period_start/end`, proration interval/credit;
- `gift_grant_id` и покрытые строки;
- renewal price и timestamp подтверждения.

Старая subscription продолжает ссылаться на свой snapshot. Каталог не переписывает оплаченный период. Новая цена применяется после уведомления к следующему renewal, кроме подтверждённого upgrade.

## 8. Таблица решений для утверждения

| № | Решение | Рекомендация |
|---:|---|---|
| 1 | Модель | **B — сбалансированная** |
| 2 | База конкретного бота | **1 490 ₽/мес, одна платформа включена** |
| 3 | Дополнительная платформа | **590 ₽/мес; только после готовности adapter** |
| 4 | Платные модули на старте | **Нет. AI 990 ₽ запускать только с capability/metering** |
| 5 | Usage | **Только AI/provider cost; prepaid, без неожиданной постоплаты** |
| 6 | Год | **12 по цене 10 (14 900 ₽ база)** |
| 7 | Upgrade/downgrade | **Upgrade сразу с prorate; downgrade на renewal** |
| 8 | Gift Grant | **Один бот forever + одна платформа; add-ons отдельно** |
| 9 | Lifetime | **Не продавать; только legacy/Gift** |
| 10 | Grace | **7 дней, затем pause только неоплаченного бота** |
| 11 | Возвраты/налоги | Отдельное юридическое утверждение до production checkout |

После утверждения 1–10 можно стабилизировать catalog contract и продолжить R3. Пункт 11 блокирует production checkout, но не схему каталога.

## 9. Источники и ограничения

- [SaleBot — официальная документация](https://docs.salebot.pro/nashi-uslugi/tarify)
- [BotHelp — официальные тарифы](https://bothelp.io/ru/pricing)
- [PuzzleBot — официальные тарифы](https://puzzlebot.top/price?lang=ru)
- [Botmother — официальные тарифы](https://botmother.ru/price)
- [ChatPlace — официальные тарифы](https://chatplace.io/ru/pricing/index.html)
- [ChatPlace Help Center — официальная детализация](https://help.chatplace.io/en/articles/6763310-%D1%82%D0%B0%D1%80%D0%B8%D1%84%D0%BD%D1%8B%D0%B5-%D0%BF%D0%BB%D0%B0%D0%BD%D1%8B-%D0%B2-chatplace)
- [Manychat — официальные тарифы](https://manychat.com/pricing)

Проверено 27.08.2026. Manychat локализует валюту по региону; зафиксирована валюта официальной страницы при проверке без пересчёта. Динамические калькуляторы могут показывать иной contact tier/валюту. Перед публичным сравнением BotFlow конкурентные цены нужно проверять повторно.
