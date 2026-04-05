import { config } from './config.js';

export const ui = {
  // Главное меню
  mainMenu: () => `
${config.brandEmoji} *Добро пожаловать в ${config.brandName}*

Выберите нужное действие:
• 📦 Выбрать тариф и оплатить
• 📋 Мои подписки
• ℹ️ FAQ
• ❓ Поддержка
`,

  // Выбор тариф
  selectPlan: (brands) => `
${config.brandEmoji} *Выберите подходящий тариф*

Все тарифы включают:
✅ Быстрое подключение
✅ Разблокировка сайтов
✅ Высокая скорость
✅ Техподдержка

_Нажмите на тариф для подробной информации_
`,

  // Карточка тарифа
  planCard: (plan) => `
*${plan.badge}* 🎯

${plan.title}
${plan.description}

💰 Стоимость: ${plan.price} ₽
⏱️ Срок: ${plan.days} дней
${plan.days <= 30 ? '✨ Попробуйте!' : plan.days <= 90 ? '⭐ Популярно!' : '🏆 Лучший выбор!'}

_Нажмите кнопку "Оплатить" чтобы начать платёж_
`,

  // Способ оплаты
  paymentMethod: (plan, paymentId) => `
*Оформление платежа*

Тариф: ${plan.title}
Сумма: ${plan.price} ₽

${config.brandEmoji} *Способ оплаты:*
Банковский перевод (реквизиты ниже)

🏦 ООО "Компания"
📊 Отправитель: Юридическое лицо
🆔 ИНН: 7700000000
📌 КПП: 040000000
💳 Расчётный счёт: 40702840000000000000
🏦 БИК: 044525225
📨 Корреспондентский счёт: 30101810900000000225

*Реквизиты в назначении платежа:*
\`Оплата за тариф ${plan.id}\`

💡 *Важно:* Укажите ваш Telegram ID в назначении платежа:
\`#${paymentId}\`

После оплаты нажмите "✅ Оплачено". После проверки мы автоматически продлим подписку и пришлём уведомление в бота.
`,

  // Ввод ваучера
  voucherInput: () => `
🎟️ *Активация ваучера*

Введите код ваучера в формате:
\`XXXX-XXXX-XXXX-XXXX\`

*Пример:* \`AB12-CD34-EF56-GH78\`

Нажмите /cancel чтобы вернуться в меню
`,

  // Успешная активация
  voucherSuccess: (plan, expiresAt, subscriptionUrl) => `
✅ *Ваучер активирован!*

Поздравляем! Вы получили доступ к ${config.brandName}

📦 Тариф: ${plan.title}
⏱️ Действителен до: ${new Date(expiresAt).toLocaleString('ru-RU')}

${subscriptionUrl
  ? `🔗 *Ваша ссылка для подключения:*\n\`${subscriptionUrl}\`\n\n💡 Скопируйте ссылку и добавьте её в ваш VPN клиент`
  : '❗ Не удалось получить ссылку подключения, обратитесь в поддержку'}

${config.brandEmoji} *Спасибо за покупку!*
`,

  // Подписки
  subscriptions: (items) => {
    if (!items.length) {
      return `
📋 *У вас пока нет активных подписок*

Выберите тариф в главном меню.
Если вам подарили ваучер, используйте команду /voucher
      `;
    }

    const list = items
      .map((item) => {
        const daysLeft = Math.ceil(
          (new Date(item.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
        );
        return `
*${item.planTitle}* ✅
⏳ Осталось: ${daysLeft} дней
📅 До: ${new Date(item.expiresAt).toLocaleString('ru-RU')}
${item.subscriptionUrl ? `🔗 [Подписка](${item.subscriptionUrl})` : ''}
      `;
      })
      .join('\n');

    return `
📋 *Ваши активные подписки*

${list}

💡 Продлить подписку: оплатите тариф в боте.
Если вам подарили ваучер, используйте команду /voucher
    `;
  },

  faq: () => `
ℹ️ *FAQ и подключение*

*Как подключиться после покупки в боте?*
1. Дождитесь подтверждения оплаты.
2. Откройте раздел *📋 Мои подписки*.
3. Скопируйте ссылку подписки.
4. Импортируйте её в VPN-клиент.

*Какие клиенты использовать?*
• Windows: v2rayN или Hiddify
• macOS: v2rayU или Hiddify
• Android: Hiddify Next или v2rayNG
• iPhone/iPad: Streisand или Shadowrocket
• Linux: Hiddify / sing-box

*Если мне подарили ваучер?*
Используйте команду /voucher и введите код.

*Где придут уведомления?*
Все уведомления о продлении и статусе подписки будут приходить в этого Telegram-бота.
`,

  // Ошибки
  errors: {
    voucherNotFound: '❌ Ваучер не найден',
    voucherInactive: '❌ Ваучер неактивен или уже использован',
    serverError: '❌ Ошибка сервера. Попробуйте позже',
    invalidCode: '❌ Неверный формат кода. Используйте: XXXX-XXXX-XXXX-XXXX'
  },

  // Успешно
  success: {
    paymentCreated: '✅ Платёж создан. Отправьте средства по реквизитам и нажмите "Оплачено"',
    voucherActivated: '✅ Ваучер активирован успешно!'
  }
};

// Клавиатуры
export const keyboards = {
  main: () => ({
    reply_markup: {
      keyboard: [
        [{ text: '📦 Выбрать тариф' }],
        [{ text: '📋 Мои подписки' }],
        [{ text: 'ℹ️ FAQ' }],
        [{ text: '❓ Поддержка' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  }),

  plans: (plans) => ({
    reply_markup: {
      inline_keyboard: [
        ...plans.map(plan => [
          {
            text: `${plan.title} • ${plan.price}₽`,
            callback_data: `plan_${plan.id}`
          }
        ]),
        [{ text: '← Назад', callback_data: 'back_main' }]
      ]
    }
  }),

  paymentConfirm: (plan) => ({
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Оплачено', callback_data: `payment_confirm_${plan.id}` }],
        [{ text: '← Назад', callback_data: 'back_plans' }]
      ]
    }
  }),

  back: () => ({
    reply_markup: {
      inline_keyboard: [
        [{ text: '← Назад', callback_data: 'back_main' }]
      ]
    }
  }),

  voucherAction: () => ({
    reply_markup: {
      keyboard: [
        [{ text: '← Отмена' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  })
};
