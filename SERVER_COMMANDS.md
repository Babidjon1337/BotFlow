# Шпаргалка по серверным командам (BotFlow)

Здесь собраны все необходимые команды для управления сервером (Timeweb Cloud), бэкендом, фронтендом и базой данных. Все команды выполняются в терминале сервера от пользователя `root`.

## 🔄 Перезапуск и управление бэкендом (Python/FastAPI)

При изменении `.env` файла или обновлении Python-кода необходимо перезапускать сервис:

```bash
# Перезапустить бэкенд
systemctl restart botflow

# Проверить статус (работает ли, нет ли ошибок при запуске)
systemctl status botflow --no-pager

# Посмотреть логи в реальном времени (самое важное для дебага!)
journalctl -u botflow.service -f

# Обновить данные с гита
./deploy.sh
```

## 🌐 Управление Nginx (Веб-сервер)

Nginx отвечает за проксирование HTTPS-запросов и раздачу статики (Vite).
Настройки лежат по пути: `/etc/nginx/sites-available/botflow.malinaezo.ru` (и линк в `sites-enabled/`).

```bash
# Отредактировать конфиг Nginx
nano /etc/nginx/sites-available/botflow.malinaezo.ru

# Проверить конфигурацию Nginx на ошибки синтаксиса
nginx -t

# Применить изменения Nginx (без полной остановки сервера)
systemctl reload nginx

# Посмотреть ошибки доступа или запросы Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 📦 Обновление проекта из GitHub (Git Pull)

Когда разработчик пушит новый код в репозиторий, вам нужно стянуть его на сервер:

```bash
cd /var/www/BotFlow

# Забрать последние изменения
git pull origin main
```

После `git pull` обычно нужно обновить зависимости, базу данных и пересобрать фронтенд (см. ниже).

## 🛠 Обновление и сборка фронтенда (React/Vite)

Если изменения коснулись папки `frontend/`, нужно пересобрать React-приложение:

```bash
cd /var/www/BotFlow/frontend

# Если добавились новые пакеты (обычно не нужно, если не менялся package.json)
npm install

# Собрать новую версию фронтенда (папка dist обновится)
npm run build
```

_Nginx сразу же подхватит новую папку `dist/`, перезапускать Nginx не обязательно._

## 💾 Миграции базы данных (Alembic)

Если изменения коснулись структуры таблиц (файл `models.py`), нужно применить миграции к базе данных:

```bash
cd /var/www/BotFlow/backend

# Активировать виртуальное окружение
source venv/bin/activate

# Если нужно СОЗДАТЬ новую миграцию (автогенерация)
alembic revision --autogenerate -m "Название_изменения"

# ПРИМЕНИТЬ миграции к базе данных (обновить таблицы)
alembic upgrade head
```

## 📝 Зависимости бэкенда (Requirements)

Если добавились новые библиотеки в `backend/requirements.txt`:

```bash
cd /var/www/BotFlow/backend
source venv/bin/activate
pip install -r requirements.txt
systemctl restart botflow
```

## 🔒 Настройка SSL сертификатов (Certbot)

Сертификаты обновляются сами благодаря `certbot.timer`, но если нужно проверить или перевыпустить:

```bash
# Тестовое обновление (проверка, что всё работает)
certbot renew --dry-run
```
