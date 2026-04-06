# VPN Platform

VPN-платформа на Docker из трёх сервисов:

- `site` — публичный сайт и панель администратора
- `api-payments` — API платежей, логика ваучеров, пробный доступ, интеграция с 3x-ui
- `bot-vouchers` — Telegram-бот для оплаты, поддержки, FAQ и управления подпиской

## Что запускается

После старта поднимаются три контейнера:

- `vpn_site` на порту `3000`
- `vpn_api_payments` на порту `8788`
- `vpn_bot_vouchers` — Telegram polling bot

Публичные адреса:

- `https://your-domain.com` — сайт
- `https://api.your-domain.com` — API

Сайт проксирует запросы браузера на API внутри Docker, но `api.your-domain.com` полезен для диагностики, прямых проверок и интеграций.

## Требования

- Linux-сервер с Docker Engine и Docker Compose v2
- DNS A-записи для `your-domain.com` и `api.your-domain.com`, указывающие на IP сервера
- Доступ к панели 3x-ui
- Токен Telegram-бота от BotFather
- Числовой Telegram ID администратора
- Открытые порты `80` и `443`

## Структура проекта

- `site/` — фронтенд и панель администратора
- `api-payments/` — backend API и интеграция с 3x-ui
- `bot-vouchers/` — Telegram-бот
- `docker-compose.yml` — оркестрация контейнеров
- `.env.example` — пример переменных окружения

## 1. Подготовка сервера

Пример для Ubuntu:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg openssl nginx
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
newgrp docker
```

Проверка установки:

```bash
docker --version
docker compose version
nginx -v
```

## 2. Клонирование репозитория

```bash
git clone <ссылка-на-репозиторий> site4
cd site4
```

## 3. Настройка переменных окружения

Создать рабочий файл из шаблона:

```bash
cp .env.example .env
nano .env
```

Минимальный набор переменных, которые нужно заполнить:

```env
TELEGRAM_BOT_TOKEN=1234567890:токен_бота
TG_BOT_USERNAME=@username_бота
BOT_CHAT_ID=123456789
WEBHOOK_URL=
WEBHOOK_PATH=/bot-webhook
WEBHOOK_PORT=8080
DOMAIN=your-domain.com
API_DOMAIN=api.your-domain.com
XUI_PANEL_URL=https://ВАШ_XUI_IP:ПОРТ/panel
XUI_PUBLIC_URL=https://your-domain.com
XUI_USERNAME=логин_от_xui
XUI_PASSWORD=пароль_от_xui
XUI_INBOUND_ID=1
JWT_SECRET=длинная_случайная_строка
ADMIN_PASSWORD=пароль_администратора
INTERNAL_API_TOKEN=длинный_случайный_токен_для_внутренних_эндпоинтов
```

Сгенерировать безопасные значения:

```bash
openssl rand -hex 32
openssl rand -base64 24
```

Примечания:

- `DOMAIN` — ваш основной домен
- `API_DOMAIN` — поддомен API, обычно `api.ваш-домен`
- `API_URL` — оставить `http://api-payments:8788` (внутренний адрес Docker)
- `PUBLIC_BASE_URL` — отдельно в `.env` не нужен, Docker Compose соберет его как `https://${API_DOMAIN}`
- `XUI_PANEL_URL` — адрес вашей панели 3x-ui (`https://IP:ПОРТ/panel`)
- `XUI_PUBLIC_URL` — публичный домен VPN, который клиенты получат в ссылке подписки
- `BOT_CHAT_ID` — числовой Telegram ID администратора, который будет получать уведомления
- `INTERNAL_API_TOKEN` — рекомендуется задать всегда, чтобы защитить внутренние служебные API-вызовы
- `WEBHOOK_URL` — опционально. Если пусто, бот работает в polling-режиме. Если задано (например `https://your-domain.com`), включается webhook.
- `WEBHOOK_PATH` — путь webhook (по умолчанию `/bot-webhook`)
- `WEBHOOK_PORT` — внутренний порт webhook-сервера бота (по умолчанию `8080`)

## 4. Запуск Docker-контейнеров

Создать директорию для данных и выставить права (нужно один раз):

```bash
mkdir -p api-payments/data
sudo chown 1001:1001 api-payments/data
```

Собрать и запустить всё:

```bash
docker compose up -d --build
```

Проверить статус:

```bash
docker compose ps
docker compose logs -f api-payments
docker compose logs -f site
docker compose logs -f bot-vouchers
```

Полезные команды:

```bash
docker compose down
docker compose up -d
docker compose restart api-payments
docker compose restart site
docker compose restart bot-vouchers
```

## 5. Выпуск TLS-сертификата Let's Encrypt

Установить certbot с плагином для nginx:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Выпустить сертификаты на оба домена:

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com -d api.your-domain.com
```

Certbot спросит email и согласие с условиями, затем предложит автоматически настроить редирект на HTTPS — выбирайте этот вариант.

Проверить автопродление:

```bash
sudo certbot renew --dry-run
```

Сертификаты сохраняются в `/etc/letsencrypt/live/your-domain.com/` и продлеваются автоматически через systemd-таймер.

## 6. Настройка Nginx

> **Важно:** если nginx установлен из официального репозитория nginx.org, он читает конфиги из `conf.d/`, а не из `sites-enabled/`. Используйте путь ниже.

Создать конфиг Nginx (замените `your-domain.com` на ваш домен):

```bash
sudo tee /etc/nginx/conf.d/vpn.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name your-domain.com www.your-domain.com api.your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Telegram bot webhook (опционально, если включён WEBHOOK_URL)
    location /bot-webhook {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
```

Проверить и применить:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 7. Проверка работоспособности

Сначала локально:

```bash
curl http://127.0.0.1:3000
curl http://127.0.0.1:8788/health
```

Затем через домены (без `-k`, сертификат уже доверенный):

```bash
curl https://your-domain.com
curl https://api.your-domain.com/health
```

Логи бота:

```bash
docker compose logs -f bot-vouchers
```

Вручную проверить:

- сайт открывается на `https://your-domain.com`
- панель администратора на `https://your-domain.com/admin`
- API отвечает на `https://api.your-domain.com/health`
- Telegram-бот отвечает на `/start`
- тарифы загружаются на сайте
- в админке доступны вкладки `Пользователи`, `Тарифы`, `Audit log`

## 8. Обновление проекта

После получения изменений из репозитория:

```bash
git pull
docker compose up -d --build
```

Если изменился только один сервис:

```bash
docker compose up -d --build api-payments
docker compose up -d --build site
docker compose up -d --build bot-vouchers
```

Если включаете webhook-режим, перезапустите минимум:

```bash
docker compose up -d --build bot-vouchers site
```

## 9. Данные и резервные копии

Данные приложения хранятся в:

- `api-payments/data/db.json`

Быстрый бэкап:

```bash
cp api-payments/data/db.json api-payments/data/db.json.backup
```

## 10. Устранение неисправностей

Если контейнеры не запускаются:

```bash
docker compose ps
docker compose logs --tail 100 api-payments
docker compose logs --tail 100 site
docker compose logs --tail 100 bot-vouchers
```

Если Nginx не стартует:

```bash
sudo nginx -t
sudo journalctl -u nginx -n 100 --no-pager
```

Если API недоступен через домен:

```bash
curl https://api.your-domain.com/health
curl http://127.0.0.1:8788/health
```

Если уведомления в Telegram не приходят:

- проверьте `TELEGRAM_BOT_TOKEN`
- проверьте `BOT_CHAT_ID`
- убедитесь, что администратор хотя бы раз открыл бота и нажал `/start`

Если webhook не работает:

- проверьте `WEBHOOK_URL`, `WEBHOOK_PATH`, `WEBHOOK_PORT` в `.env`
- проверьте проксирование пути `/bot-webhook` в nginx на `127.0.0.1:8080`
- посмотрите логи: `docker compose logs --tail 200 bot-vouchers`

Если напоминания о подписке не приходят:

- убедитесь, что у пользователя есть `telegramChatId` (он появляется после взаимодействия с ботом)
- проверьте логи API: `docker compose logs --tail 200 api-payments`
- напоминания отправляются фоново каждые 10 минут

## 11. Новые возможности админки

### Пользователи

- Поиск по Telegram username
- Просмотр текущей активной подписки
- Информация о trial-доступе
- История платежей и ваучеров по пользователю

### Тарифы

- Редактирование `title`, `badge`, `description`, `days`, `price` без правки кода
- Создание новых тарифов из админки

### Audit log

- Логируются ключевые действия: подтверждение платежей, создание ваучеров, отмена заявок
- Видно кто сделал действие, когда и по какому пользователю

### Напоминания о подписке

- Бэкенд автоматически отправляет уведомления в Telegram:
    - за 3 дня до окончания
    - в день окончания
    - после истечения
- Повторная отправка одного и того же типа напоминания блокируется журналом отправок

## Безопасность

- Не коммитьте реальный `.env` в репозиторий
- `.env.example` — только шаблон, не содержит секретов
- Держите `JWT_SECRET`, `ADMIN_PASSWORD`, токен бота и учётные данные XUI в тайне
