# API Платежей и Ваучеров

REST API для управления платежами VPN подписок и ваучер-кодами.

## Быстрый старт

```bash
npm install
cp .env.example .env
npm start
```

Требуется Node.js 20+.

## Переменные окружения

```env
# Обязательные
TELEGRAM_BOT_TOKEN=123456:token                # Токен Telegram бота
ADMIN_TELEGRAM_ID=123456789                    # Telegram ID администратора
JWT_SECRET=replace_with_long_random_string     # Секрет JWT
ADMIN_PASSWORD=replace_with_admin_password     # Пароль админки
PUBLIC_BASE_URL=http://localhost:8788          # Публичный URL API
XUI_PANEL_URL=https://1.2.3.4:2053/panel       # URL панели 3x-ui
XUI_PUBLIC_URL=https://vpn.example.com         # Публичный URL подписки
XUI_USERNAME=replace_with_xui_username         # Логин 3x-ui
XUI_PASSWORD=replace_with_xui_password         # Пароль 3x-ui

# Опциональные
PORT=8788
DB_PATH=../data/db.json
INTERNAL_API_TOKEN=
TRIAL_COOLDOWN_MS=2592000000
BOT_HEARTBEAT_STALE_MS=120000
SITE_HEALTH_URL=http://site:3000/health
XUI_INBOUND_ID=1
```

Примечание: если запускаете в Docker через корневой `docker-compose.yml`, `PUBLIC_BASE_URL` формируется автоматически из `API_DOMAIN`.

## API Endpoints

### Публичные

#### Получить тарифы
```
GET /api/plans
```

#### Создать платёж
```
POST /api/payments/create
Content-Type: application/json

{
  "userId": 123456,
  "planId": "vpn-30",
  "firstName": "Иван",
  "lastName": "Петров",
  "username": "ivan_petrov"
}
```

Ответ:
```json
{
  "paymentId": "uuid",
  "amount": 300,
  "description": "Старт на 30 дней",
  "accountNumber": "40702840000000000000",
  "bankName": "ООО \"Компания\""
}
```

#### Получить статус платежа
```
GET /api/payments/:paymentId
```

#### Активировать ваучер
```
POST /api/vouchers/activate
Content-Type: application/json

{
  "code": "XXXX-XXXX-XXXX-XXXX",
  "userId": 123456
}
```

#### Получить подписки пользователя
```
GET /api/users/:userId/subscriptions
```

### Админ (требуется авторизация)

Все админ запросы требуют заголовка:
```
Authorization: Bearer <base64_encoded_token>
```

Где token это:
```
btoa(JSON.stringify({ password: "ADMIN_PASSWORD", adminId: "admin" }))
```

#### Подтвердить платёж
```
POST /api/admin/payments/:paymentId/confirm
```

Ответ:
```json
{
  "voucher": {
    "id": "uuid",
    "code": "XXXX-XXXX-XXXX-XXXX",
    "status": "active",
    "planId": "vpn-30"
  }
}
```

#### Получить все платежи
```
GET /api/admin/payments
```

Ответ:
```json
{
  "pending": [...],
  "confirmed": [...]
}
```

#### Создать ваучеры
```
POST /api/admin/vouchers/create
Content-Type: application/json

{
  "planId": "vpn-30",
  "quantity": 5
}
```

Ответ:
```json
{
  "vouchers": [
    { "id": "uuid", "code": "XXXX-XXXX-XXXX-XXXX", "status": "active" },
    ...
  ]
}
```

## Структура БД

```json
{
  "users": [
    {
      "telegramId": 123456,
      "firstName": "Иван",
      "lastName": "Петров",
      "username": "ivan_petrov",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  
  "payments": [
    {
      "id": "uuid",
      "userId": 123456,
      "planId": "vpn-30",
      "planTitle": "Старт на 30 дней",
      "amount": 300,
      "currency": "RUB",
      "days": 30,
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00Z",
      "confirmedAt": null
    }
  ],
  
  "vouchers": [
    {
      "id": "uuid",
      "code": "XXXX-XXXX-XXXX-XXXX",
      "status": "active",
      "planId": "vpn-30",
      "days": 30,
      "createdAt": "2024-01-01T00:00:00Z",
      "usedAt": null,
      "usedBy": null,
      "linkedPaymentId": "uuid"
    }
  ],
  
  "issuedAccess": [
    {
      "id": "uuid",
      "userId": 123456,
      "voucherId": "uuid",
      "planId": "vpn-30",
      "planTitle": "Старт на 30 дней",
      "days": 30,
      "expiresAt": "2024-02-01T00:00:00Z",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## Webhook-и в Telegram

При новых событиях API отправляет сообщения администратору:

- Новый платёж
- Платёж подтверждён
- Ваучер активирован

## Health Check

```
GET /health

Ответ: { "ok": true }
```

## Обработка ошибок

Все ошибки возвращаются в формате:

```json
{
  "error": "Описание ошибки"
}
```

Коды ответов:
- 200 - OK
- 400 - Bad Request
- 401 - Unauthorized
- 403 - Forbidden
- 404 - Not Found
- 500 - Internal Server Error
