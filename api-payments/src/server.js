import express from 'express';
import crypto from 'crypto';
import {
  createPayment,
  getPayment,
  getPaymentsByUser,
  updatePayment,
  createVoucher,
  getVoucher,
  useVoucher,
  getPendingPayments,
  getConfirmedPayments,
  upsertUser,
  getUser,
  getIssuedAccessByUser,
  getLatestIssuedAccessByUser,
  getPlans,
  getPlanById,
  getVouchersByPayment,
  saveIssuedAccess
} from './db.js';
import { config } from './config.js';
import { createXuiClient, extendXuiClient, getXuiInbounds } from './xui.js';

function normalizeUsername(input = '') {
  return String(input).trim().replace(/^@/, '');
}

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Telegram notification
async function sendTelegramMessage(chatId, text) {
  if (chatId === undefined || chatId === null || String(chatId).trim() === '') {
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text());
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}

// Middleware для проверки админа
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    if (decoded.password !== config.adminPassword) {
      return res.status(403).json({ error: 'Invalid credentials' });
    }
    req.adminId = decoded.adminId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// PUBLIC: Получить тарифы
app.get('/api/plans', async (req, res) => {
  try {
    const plans = await getPlans();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUBLIC: Создать платёж
app.post('/api/payments/create', async (req, res) => {
  try {
    const { userId, planId, firstName, lastName, username, telegramId } = req.body;
    const normalizedUsername = normalizeUsername(username || userId);
    if (!normalizedUsername || !planId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const canonicalUserId = normalizedUsername;

    // Сохранить пользователя
    await upsertUser({
      telegramId: canonicalUserId,
      firstName,
      lastName,
      username: normalizedUsername,
      telegramChatId: telegramId || null
    });

    const user = await getUser(canonicalUserId);

    const plan = await getPlanById(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const payment = await createPayment({
      userId: canonicalUserId,
      telegramId: telegramId || null,
      planId,
      planTitle: plan.title,
      amount: plan.price,
      currency: plan.currency,
      days: plan.days
    });

    const latestAccess = await getLatestIssuedAccessByUser(canonicalUserId);

    let trial = null;
    if (!user?.trialIssuedAt) {
      try {
        const trialAccess = await createXuiClient({ username: normalizedUsername, days: 1 });
        await saveIssuedAccess({
          userId: canonicalUserId,
          voucherId: null,
          planId: 'trial-1d',
          planTitle: 'Пробный доступ (1 день)',
          days: 1,
          xuiClientId: trialAccess.uuid,
          xuiEmail: trialAccess.email,
          xuiSubId: trialAccess.subId,
          subscriptionUrl: trialAccess.subscriptionUrl,
          expiresAt: trialAccess.expiresAt,
          isTrial: true,
          sourcePaymentId: payment.id
        });

        await upsertUser({
          telegramId: canonicalUserId,
          trialIssuedAt: new Date().toISOString()
        });

        trial = {
          granted: true,
          days: 1,
          subscriptionUrl: trialAccess.subscriptionUrl,
          expiresAt: trialAccess.expiresAt
        };
      } catch (trialError) {
        console.error('Trial issue failed:', trialError.message);
      }
    }

    // Уведомить админа
    await sendTelegramMessage(
      config.adminTelegramId,
      `💰 *Новый платёж*\n\n` +
      `Пользователь: @${normalizedUsername}\n` +
      `Тариф: ${plan.title}\n` +
      `Сумма: ${plan.price} ${plan.currency}\n` +
      `ID платежа: \`${payment.id}\``
    );

    res.json({
      paymentId: payment.id,
      amount: plan.price,
      description: plan.title,
      accountNumber: '40702840000000000000', // Пример счёта
      bankName: 'ООО "Компания"',
      inn: '7700000000',
      kpp: '040000000',
      trial,
      accessLink: trial?.subscriptionUrl || latestAccess?.subscriptionUrl || null,
      accessExpiresAt: trial?.expiresAt || latestAccess?.expiresAt || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// PUBLIC: Получить статус платежа
app.get('/api/payments/:paymentId', async (req, res) => {
  try {
    const payment = await getPayment(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ADMIN: Подтвердить платёж и продлить доступ
app.post('/api/admin/payments/:paymentId/confirm', adminAuth, async (req, res) => {
  try {
    const payment = await getPayment(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const plan = await getPlanById(payment.planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    await updatePayment(payment.id, {
      status: 'confirmed',
      confirmedAt: new Date().toISOString()
    });

    const normalizedUsername = normalizeUsername(payment.userId);
    const user = await getUser(normalizedUsername);
    const latestAccess = await getLatestIssuedAccessByUser(normalizedUsername);

    let access;
    if (latestAccess?.xuiClientId) {
      const xui = await extendXuiClient({
        uuid: latestAccess.xuiClientId,
        username: normalizedUsername,
        extraDays: plan.days,
        currentExpiryTime: new Date(latestAccess.expiresAt).getTime(),
        email: latestAccess.xuiEmail,
        subId: latestAccess.xuiSubId
      });

      access = await saveIssuedAccess({
        userId: normalizedUsername,
        voucherId: null,
        planId: plan.id,
        planTitle: plan.title,
        days: plan.days,
        xuiClientId: xui.uuid,
        xuiEmail: xui.email,
        xuiSubId: xui.subId,
        subscriptionUrl: xui.subscriptionUrl,
        expiresAt: xui.expiresAt,
        isTrial: false,
        sourcePaymentId: payment.id,
        extendedFromAccessId: latestAccess.id
      });
    } else {
      const xui = await createXuiClient({ username: normalizedUsername, days: plan.days });
      access = await saveIssuedAccess({
        userId: normalizedUsername,
        voucherId: null,
        planId: plan.id,
        planTitle: plan.title,
        days: plan.days,
        xuiClientId: xui.uuid,
        xuiEmail: xui.email,
        xuiSubId: xui.subId,
        subscriptionUrl: xui.subscriptionUrl,
        expiresAt: xui.expiresAt,
        isTrial: false,
        sourcePaymentId: payment.id
      });
    }

    const userChatId = payment.telegramId || user?.telegramChatId || null;

    // Уведомить пользователя в Telegram (если известен chat id)
    if (userChatId) {
      await sendTelegramMessage(
        userChatId,
        `✅ *Подписка продлена!*\n\n` +
        `Тариф: ${plan.title}\n` +
        `Доступ до: ${new Date(access.expiresAt).toLocaleString('ru-RU')}\n` +
        `Ссылка: ${access.subscriptionUrl}`
      );
    }

    // Уведомить админа
    await sendTelegramMessage(
      config.adminTelegramId,
      `✅ *Платёж подтверждён*\n\n` +
      `Пользователь: @${normalizedUsername}\n` +
      `Тариф: ${plan.title}\n` +
      `Продлено до: ${new Date(access.expiresAt).toLocaleString('ru-RU')}\n` +
      `Ссылка: ${access.subscriptionUrl}` +
      (!userChatId ? `\n⚠️ Пользователь не получит TG-уведомление: нет chat id` : '')
    );

    res.json({
      success: true,
      planTitle: plan.title,
      expiresAt: access.expiresAt,
      subscriptionUrl: access.subscriptionUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ADMIN: Получить все платежи
app.get('/api/admin/payments', adminAuth, async (req, res) => {
  try {
    const pending = await getPendingPayments();
    const confirmed = await getConfirmedPayments();
    res.json({ pending, confirmed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUBLIC: Активировать ваучер
app.post('/api/vouchers/activate', async (req, res) => {
  try {
    const { code, username } = req.body;
    if (!code || !username) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedUsername = normalizeUsername(username);

    const voucher = await getVoucher(code);
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
    if (voucher.status !== 'active') {
      return res.status(400).json({ error: 'Voucher is not active' });
    }

    const plan = await getPlanById(voucher.planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    // Продлеваем существующий клиент, либо создаём новый
    const latestAccess = await getLatestIssuedAccessByUser(normalizedUsername);

    let xuiAccess;
    try {
      if (latestAccess?.xuiClientId) {
        xuiAccess = await extendXuiClient({
          uuid: latestAccess.xuiClientId,
          username: normalizedUsername,
          extraDays: plan.days,
          currentExpiryTime: new Date(latestAccess.expiresAt).getTime(),
          email: latestAccess.xuiEmail,
          subId: latestAccess.xuiSubId
        });
      } else {
        xuiAccess = await createXuiClient({ username: normalizedUsername, days: plan.days });
      }
    } catch (xuiError) {
      console.error('3x-ui client creation failed:', xuiError.message);
      return res.status(502).json({ error: `Failed to create VPN client: ${xuiError.message}` });
    }

    // Использовать ваучер
    await useVoucher(code, normalizedUsername);

    // Создать доступ с сохранением данных 3x-ui
    const access = await saveIssuedAccess({
      userId: normalizedUsername,
      voucherId: voucher.id,
      planId: plan.id,
      planTitle: plan.title,
      days: plan.days,
      xuiClientId: xuiAccess.uuid,
      xuiEmail: xuiAccess.email,
      xuiSubId: xuiAccess.subId,
      subscriptionUrl: xuiAccess.subscriptionUrl,
      expiresAt: xuiAccess.expiresAt,
      isTrial: false,
      sourcePaymentId: voucher.linkedPaymentId || null,
      extendedFromAccessId: latestAccess?.id || null
    });

    res.json({
      success: true,
      planId: plan.id,
      planTitle: plan.title,
      days: plan.days,
      expiresAt: access.expiresAt,
      subscriptionUrl: access.subscriptionUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// PUBLIC: Получить активные подписки пользователя
app.get('/api/users/:userId/subscriptions', async (req, res) => {
  try {
    const access = await getIssuedAccessByUser(req.params.userId);
    const active = access.filter(a => new Date(a.expiresAt) > new Date());
    res.json(active);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ADMIN: Создать ваучер вручную
app.post('/api/admin/vouchers/create', adminAuth, async (req, res) => {
  try {
    const { planId, quantity = 1 } = req.body;
    if (!planId) return res.status(400).json({ error: 'Plan ID required' });

    const vouchers = [];
    for (let i = 0; i < quantity; i++) {
      const voucher = await createVoucher({ planId });
      vouchers.push(voucher);
    }

    res.json({ vouchers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(config.port, async () => {
  console.log(`Payments API running on port ${config.port}`);
  
  // Проверяем доступные инбаунды в 3x-ui
  try {
    await getXuiInbounds();
    console.log(`[XUI] Connected successfully`);
  } catch (err) {
    console.error(`[XUI] Failed to connect:`, err.message);
  }
});
