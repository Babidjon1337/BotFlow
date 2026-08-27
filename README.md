# BotFlow

BotFlow — SaaS для создания и публикации ботов по готовым бизнес-сценариям без программирования.

Текущий production-контур работает в Telegram. Пользователь создаёт бесплатный черновик, настраивает сценарий «Воронка продаж», тестирует его на себе и оплачивает публикацию конкретного бота. VK, MAX, запись на услуги и Mini App предусмотрены как будущие сценарии и платформы, но не выдаются за готовые функции.

## Что умеет текущий продукт

- Telegram Mini App для управления ботами;
- стартовые сообщения и дожимы;
- предложения с ценой, описанием, медиа и выдачей;
- режимы автопродажи, заявок и гибрида;
- YooKassa, Robokassa и Prodamus в клиентском платёжном контуре;
- ручное выставление коммерческого предложения лиду;
- медиа через Telegram `file_id`;
- CRM лидов, статистика и уведомления;
- административные операции и журнал действий.

Фактическая готовность каждой интеграции определяется кодом, тестами и release-checklist, а не только этим списком.

## Документация

- [Глоссарий предметной области](CONTEXT.md)
- [Продуктовая модель и v1](docs/PRODUCT_MODEL.md)
- [Дизайн-система](docs/DESIGN_SYSTEM.md)
- [Архитектурные границы](docs/ARCHITECTURE.md)
- [Эксплуатация и выпуск](docs/OPERATIONS_AND_RELEASE.md)
- [План развития](docs/ROADMAP.md)

Материалы в `docs/history/` сохранены только как история. Они могут описывать отменённые слоты, lifetime-лицензии, общий PRO, trial и старую архитектуру.

## Технологии

### Backend

- Python, FastAPI, aiogram;
- PostgreSQL, SQLAlchemy, Alembic;
- APScheduler;
- интеграции с Telegram и платёжными провайдерами.

### Frontend

- React, TypeScript, Vite;
- Tailwind CSS;
- Telegram WebApp SDK;
- Framer Motion и переиспользуемые UI-компоненты.

## Локальные проверки

```powershell
backend\venv\Scripts\python.exe -m pytest -q

cd frontend
npm run lint
npm run build
```

Полный release-процесс и ручные сценарии находятся в `docs/OPERATIONS_AND_RELEASE.md`.
