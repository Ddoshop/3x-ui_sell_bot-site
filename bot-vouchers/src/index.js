import { Telegraf } from 'telegraf';
import { config } from './config.js';
import { ui, keyboards } from './ui.js';
import { api } from './services/api.js';

const bot = new Telegraf(config.telegramToken);
let currentDeliveryMode = 'stopped';
let webhookServer = null;
let webhookHealthTimer = null;
let webhookRecoveryTimer = null;

// Состояния пользователей
const userStates = new Map();

function setState(userId, state) {
  userStates.set(userId, state);
}

function getState(userId) {
  return userStates.get(userId) || 'main';
}

function clearState(userId) {
  userStates.delete(userId);
}

function getTelegramUsername(ctx) {
  return ctx.from?.username ? String(ctx.from.username).replace(/^@/, '') : '';
}

async function replyMainMenu(ctx) {
  clearState(ctx.from.id);
  return ctx.reply(ui.mainMenu(), {
    parse_mode: 'Markdown',
    ...keyboards.main()
  });
}

async function showPlans(ctx) {
  const plans = await api.getPlans();
  setState(ctx.from.id, 'select_plan');
  return ctx.reply(ui.selectPlan(plans), {
    parse_mode: 'Markdown',
    ...keyboards.plans(plans)
  });
}

// Старт
bot.start(async (ctx) => {
  await replyMainMenu(ctx);
});

// Главное меню
bot.hears('📦 Выбрать тариф', async (ctx) => {
  try {
    await showPlans(ctx);
  } catch (error) {
    await ctx.reply(ui.errors.serverError);
  }
});

bot.command('voucher', async (ctx) => {
  setState(ctx.from.id, 'waiting_voucher');
  await ctx.reply(ui.voucherInput(), {
    parse_mode: 'Markdown',
    ...keyboards.voucherAction()
  });
});

bot.hears('ℹ️ FAQ', async (ctx) => {
  await ctx.reply(ui.faq(), {
    parse_mode: 'Markdown',
    ...keyboards.main()
  });
});

bot.hears('📋 Мои подписки', async (ctx) => {
  try {
    const username = getTelegramUsername(ctx);
    if (!username) {
      return await ctx.reply('❌ У вас не установлен Telegram username. Добавьте username в настройках Telegram и повторите.', {
        parse_mode: 'Markdown',
        ...keyboards.main()
      });
    }

    const subscriptions = await api.getUserSubscriptions(username);
    await ctx.reply(ui.subscriptions(subscriptions), {
      parse_mode: 'Markdown',
      ...keyboards.main()
    });
  } catch (error) {
    await ctx.reply(ui.errors.serverError);
  }
});

bot.hears('❓ Поддержка', async (ctx) => {
  const supportText =
    `💬 *Техподдержка*\n\n` +
    `Если есть вопрос по оплате, подключению или продлению, напишите администратору в Telegram.\n\n` +
    `🕐 Ответим, как только освободимся.`;

  if (config.supportTelegramId) {
    await ctx.reply(supportText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '✉️ Написать администратору', url: `tg://user?id=${config.supportTelegramId}` }]]
      }
    });
    await ctx.reply('Главное меню:', keyboards.main());
    return;
  }

  await ctx.reply(`${supportText}\n\n⚠️ Контакт админа ещё не настроен в окружении.`, {
    parse_mode: 'Markdown',
    ...keyboards.main()
  });
});

// Обработка выбора тарифа
bot.action(/^plan_(.+)$/, async (ctx) => {
  try {
    const username = getTelegramUsername(ctx);
    if (!username) {
      return await ctx.answerCbQuery('Установите username в Telegram и попробуйте снова');
    }

    const plans = await api.getPlans();
    const plan = plans.find(p => p.id === ctx.match[1]);
    if (!plan) return await ctx.answerCbQuery('Тариф не найден');

    setState(ctx.from.id, `plan_selected_${plan.id}`);

    // Создать платёж
    const payment = await api.createPayment(`@${username}`, plan.id, {
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      username,
      telegramId: ctx.from.id
    });

    await ctx.editMessageText(ui.paymentMethod(plan, payment.paymentId), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Оплачено', callback_data: `payment_confirm_${plan.id}` }],
          [{ text: '← Назад', callback_data: 'back_plans' }]
        ]
      }
    });

    await ctx.answerCbQuery('Реквизиты отправлены');
  } catch (error) {
    console.error(error);
    await ctx.answerCbQuery(ui.errors.serverError);
  }
});

// Подтверждение оплаты (тестовое)
bot.action(/^payment_confirm_(.+)$/, async (ctx) => {
  try {
    const plans = await api.getPlans();
    const plan = plans.find(p => p.id === ctx.match[1]);

    await ctx.editMessageText(
      `⏳ *Ожидание подтверждения*\n\n` +
      `Ваш платёж отправлен администратору на проверку.\n` +
      `Как только платёж подтвердят, бот пришлёт уведомление о продлении подписки.\n\n` +
      `Тариф: ${plan.title}\n` +
      `Сумма: ${plan.price}₽`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '← Назад', callback_data: 'back_plans' }]
          ]
        }
      }
    );

    await ctx.answerCbQuery('Платёж отправлен на проверку');
  } catch (error) {
    await ctx.answerCbQuery(ui.errors.serverError);
  }
});

// Обработка ввода ваучера
bot.on('text', async (ctx) => {
  const state = getState(ctx.from.id);

  if (state === 'waiting_voucher') {
    const input = ctx.message.text.trim().toUpperCase();

    if (input === '← ОТМЕНА') {
      clearState(ctx.from.id);
      return await ctx.reply(ui.mainMenu(), {
        parse_mode: 'Markdown',
        ...keyboards.main()
      });
    }

    // Валидация формата
    const voucherRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!voucherRegex.test(input)) {
      return await ctx.reply(ui.errors.invalidCode, {
        parse_mode: 'Markdown'
      });
    }

    try {
      const username = getTelegramUsername(ctx);
      if (!username) {
        return await ctx.reply('❌ У вас не установлен Telegram username. Добавьте username в настройках Telegram и повторите.', {
          parse_mode: 'Markdown'
        });
      }

      const result = await api.activateVoucher(input, username);
      clearState(ctx.from.id);

      const plans = await api.getPlans();
      const plan = plans.find(p => p.id === result.planId);

      await ctx.reply(ui.voucherSuccess(plan || result, result.expiresAt, result.subscriptionUrl), {
        parse_mode: 'Markdown',
        ...keyboards.main()
      });
    } catch (error) {
      const errorMsg = error.message.includes('not found')
        ? ui.errors.voucherNotFound
        : error.message.includes('not active')
        ? ui.errors.voucherInactive
        : ui.errors.serverError;

      await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
    }
  }
});

// Callback back
bot.action('back_main', async (ctx) => {
  try {
    await ctx.deleteMessage();
  } catch {}
  await replyMainMenu(ctx);
  await ctx.answerCbQuery();
});

bot.action('back_plans', async (ctx) => {
  try {
    const plans = await api.getPlans();
    setState(ctx.from.id, 'select_plan');
    try {
      await ctx.editMessageText(ui.selectPlan(plans), {
        parse_mode: 'Markdown',
        ...keyboards.plans(plans)
      });
    } catch {
      try {
        await ctx.deleteMessage();
      } catch {}
      await ctx.reply(ui.selectPlan(plans), {
        parse_mode: 'Markdown',
        ...keyboards.plans(plans)
      });
    }
    await ctx.answerCbQuery();
  } catch (error) {
    await ctx.answerCbQuery(ui.errors.serverError);
  }
});

// Cancel команда
bot.command('cancel', async (ctx) => {
  await replyMainMenu(ctx);
});

function clearDeliveryTimers() {
  if (webhookHealthTimer) {
    clearInterval(webhookHealthTimer);
    webhookHealthTimer = null;
  }
  if (webhookRecoveryTimer) {
    clearInterval(webhookRecoveryTimer);
    webhookRecoveryTimer = null;
  }
}

async function getWebhookInfo() {
  return bot.telegram.callApi('getWebhookInfo');
}

async function stopCurrentDeliveryMode(reason = 'switch') {
  clearDeliveryTimers();

  try {
    bot.stop(reason);
  } catch {}

  if (webhookServer) {
    await new Promise((resolve) => webhookServer.close(() => resolve()));
    webhookServer = null;
  }

  currentDeliveryMode = 'stopped';
}

async function startPollingMode(reason = 'fallback') {
  if (currentDeliveryMode === 'polling') {
    return;
  }

  await stopCurrentDeliveryMode(`to-polling:${reason}`);
  await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
  await bot.launch();
  currentDeliveryMode = 'polling';
  console.log(`📡 Polling mode enabled (${reason})`);

  if (config.webhookUrl) {
    webhookRecoveryTimer = setInterval(async () => {
      try {
        console.log('🔁 Trying to recover webhook mode...');
        await startWebhookMode('recovery');
      } catch (error) {
        console.error('Webhook recovery attempt failed:', error.message);
      }
    }, config.webhookRetryIntervalMs);
  }
}

async function waitForWebhookHealthCheck(startedAtSeconds) {
  const deadline = Date.now() + config.webhookFallbackTimeoutMs;

  while (Date.now() < deadline) {
    const info = await getWebhookInfo();
    const lastErrorDate = Number(info.last_error_date || 0);
    const hasFreshError = lastErrorDate >= startedAtSeconds;

    if (info.url && !hasFreshError) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return false;
}

async function monitorWebhookHealth() {
  if (currentDeliveryMode !== 'webhook') {
    return;
  }

  try {
    const info = await getWebhookInfo();
    const lastErrorDate = Number(info.last_error_date || 0);
    const hasRecentError = lastErrorDate > 0 && (Date.now() / 1000 - lastErrorDate) <= Math.ceil(config.webhookFallbackTimeoutMs / 1000);

    if (hasRecentError) {
      console.error(`Webhook health degraded: ${info.last_error_message || 'unknown error'}`);
      await startPollingMode('webhook-health-failed');
    }
  } catch (error) {
    console.error('Webhook health check failed:', error.message);
  }
}

async function startWebhookMode(reason = 'startup') {
  if (!config.webhookUrl) {
    throw new Error('WEBHOOK_URL is not configured');
  }

  const webhookUrl = `${config.webhookUrl.replace(/\/$/, '')}${config.webhookPath}`;
  const startedAtSeconds = Math.floor(Date.now() / 1000);

  await stopCurrentDeliveryMode(`to-webhook:${reason}`);
  await bot.telegram.setWebhook(webhookUrl);
  webhookServer = await bot.startWebhook(config.webhookPath, null, config.webhookPort);

  const isHealthy = await waitForWebhookHealthCheck(startedAtSeconds);
  if (!isHealthy) {
    console.error(`Webhook mode check failed after ${config.webhookFallbackTimeoutMs}ms, switching to polling`);
    await startPollingMode('webhook-timeout');
    return false;
  }

  currentDeliveryMode = 'webhook';
  console.log(`🌐 Webhook mode enabled (${reason}): ${webhookUrl}`);
  webhookHealthTimer = setInterval(() => {
    monitorWebhookHealth().catch((error) => {
      console.error('Webhook monitor failure:', error.message);
    });
  }, config.webhookHealthIntervalMs);

  return true;
}

// Запуск
console.log('🤖 VPN Vouchers Bot starting...');

if (config.webhookUrl) {
  await startWebhookMode('startup');
  if (currentDeliveryMode !== 'webhook') {
    console.log('Webhook unavailable, bot continues in polling mode');
  }
} else {
  await startPollingMode('no-webhook-config');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
