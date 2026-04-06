const APP_CONFIG = window.APP_CONFIG || {};
const API_URL = APP_CONFIG.apiUrl || '/api';
const TG_BOT_USERNAME = (APP_CONFIG.tgBotUsername || '').replace(/^@/, '');
const BRAND_NAME = APP_CONFIG.brandName || 'VPN Premium';
const BRAND_EMOJI = APP_CONFIG.brandEmoji || '🌐';

let selectedPlan = null;
let currentPayment = null;
let paymentMarkedSent = false;
let availablePlans = [];
let carouselIndex = 0;

function getStoredUsername() {
  return localStorage.getItem('vpnUsername') || '';
}

function setStoredUsername(username) {
  localStorage.setItem('vpnUsername', username.replace(/^@/, ''));
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  applyBranding();
  setPlansLoading();
  loadPlans();
});

function getBrowserFingerprint() {
  const storageKey = 'vpnBrowserFingerprint';
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const seed = [
    navigator.userAgent || 'ua',
    navigator.language || 'lang',
    navigator.platform || 'platform',
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'tz',
    String(screen.width || 0),
    String(screen.height || 0),
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : String(Date.now())
  ].join('|');

  localStorage.setItem(storageKey, seed);
  return seed;
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;

  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent;
  }

  button.disabled = isLoading;
  button.classList.toggle('is-loading', isLoading);
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
}

function setPlansLoading() {
  const grid = document.getElementById('plansGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="empty-state-card">
      <h3>⏳ Загружаем тарифы</h3>
      <p>Проверяем актуальные цены и срок действия...</p>
    </div>
  `;
}

function setPlansError(text) {
  const grid = document.getElementById('plansGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="empty-state-card error">
      <h3>⚠️ Не удалось загрузить тарифы</h3>
      <p>${text}</p>
      <button class="btn btn-secondary" onclick="loadPlans()">Повторить</button>
    </div>
  `;
}

function applyBranding() {
  const title = document.querySelector('title');
  const brandNameEl = document.querySelector('.brand-name');
  const brandEmojiEl = document.querySelector('.brand-emoji');
  const footerBrand = document.getElementById('footerBrandName');

  if (title) {
    title.textContent = `${BRAND_NAME} - Быстрое и защищённое соединение`;
  }
  if (brandNameEl) {
    brandNameEl.textContent = BRAND_NAME;
  }
  if (brandEmojiEl) {
    brandEmojiEl.textContent = BRAND_EMOJI;
  }
  if (footerBrand) {
    footerBrand.textContent = BRAND_NAME;
  }
}

// Загрузить тарифы
async function loadPlans() {
  try {
    console.log('Loading plans from:', `${API_URL}/plans`);
    const response = await fetch(`${API_URL}/plans`);
    console.log('Response status:', response.status);
    if (!response.ok) throw new Error('Failed to load plans');
    
    const plans = await response.json();
    availablePlans = Array.isArray(plans) ? plans : [];
    console.log('Plans loaded:', plans);
    renderPlans(availablePlans);
  } catch (error) {
    console.error('Error loading plans:', error);
    setPlansError('Проверьте соединение с сервером и попробуйте снова.');
  }
}

// Отобразить тарифы (карусель)
function renderPlans(plans) {
  const grid = document.getElementById('plansGrid');
  if (!Array.isArray(plans) || plans.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-card">
        <h3>📭 Тарифы временно недоступны</h3>
        <p>Администратор скоро добавит новые предложения.</p>
      </div>
    `;
    return;
  }

  // Infinite carousel: get 3 visible plans using modulo wrapping
  const visiblePlans = [];
  for (let i = 0; i < 3; i++) {
    const idx = (carouselIndex + i) % plans.length;
    visiblePlans.push(plans[idx]);
  }

  const hasNav = plans.length > 3;

  grid.innerHTML = `
    <div class="carousel-container" ${hasNav ? 'style="display: flex; align-items: center; gap: 15px;"' : ''}>
      ${hasNav ? `<button class="carousel-btn carousel-prev" onclick="prevPlanSlide()">◀</button>` : ''}
      
      <div class="carousel-content" style="flex: 1;">
        <div class="plans-grid">
          ${visiblePlans.map((plan, idx) => {
            const isFeatured = idx === 1; // Always highlight the middle one
            return `
              <div class="plan-card ${isFeatured ? 'featured' : ''}">
                ${isFeatured ? `<div style="position: absolute; top: -15px; left: 20px;">⭐</div>` : ''}
                <div class="plan-badge">${plan.badge}</div>
                <h3 class="plan-title">${plan.title}</h3>
                <p class="plan-description">${plan.description}</p>
                
                <div class="plan-price">${plan.price} ₽</div>
                <div class="plan-period">за ${plan.days} дней</div>
                
                <ul class="plan-features">
                  <li>Полный доступ на ${plan.days} дней</li>
                  <li>Высокая скорость подключения</li>
                  <li>Поддержка всех устройств</li>
                  <li>Техподдержка 24/7</li>
                </ul>
                
                <button class="btn btn-primary plan-button" onclick="selectPlan('${plan.id}')">
                  💳 Заказать тариф
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      ${hasNav ? `<button class="carousel-btn carousel-next" onclick="nextPlanSlide()">▶</button>` : ''}
    </div>
  `;
}

function nextPlanSlide() {
  carouselIndex++;
  renderPlans(availablePlans);
}

function prevPlanSlide() {
  carouselIndex--;
  renderPlans(availablePlans);
}

// Выбрать тариф
async function selectPlan(planId) {
  try {
    if (!availablePlans.length) {
      await loadPlans();
    }
    selectedPlan = availablePlans.find(p => p.id === planId);
    
    if (!selectedPlan) return;

    openPurchaseModal(selectedPlan);
  } catch (error) {
    console.error('Error selecting plan:', error);
    alert('Ошибка: ' + error.message);
  }
}

function openPurchaseModal(plan) {
  const modal = document.getElementById('purchaseModal');
  const planSummary = document.getElementById('purchasePlanSummary');
  const usernameInput = document.getElementById('purchaseUsername');
  const subtitle = document.getElementById('purchaseModalSubtitle');
  const botLink = document.getElementById('modalBotLink');
  const botHint = document.getElementById('modalBotHint');

  if (!modal || !planSummary) return;

  planSummary.innerHTML = `
    <div class="detail-item">
      <span class="detail-label">Тариф:</span>
      <span class="detail-value">${plan.title}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Срок:</span>
      <span class="detail-value">${plan.days} дней</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Сумма:</span>
      <span class="detail-value">${plan.price} ₽</span>
    </div>
  `;

  currentPayment = null;
  paymentMarkedSent = false;
  switchPurchaseStep('start');
  if (subtitle) {
    subtitle.textContent = 'Введите ваш Telegram username, чтобы создать заявку на оплату.';
  }
  if (botLink) {
    if (TG_BOT_USERNAME) {
      botLink.href = `https://t.me/${TG_BOT_USERNAME}`;
      botLink.textContent = `@${TG_BOT_USERNAME}`;
      botLink.style.display = 'inline-flex';
    } else {
      botLink.removeAttribute('href');
      botLink.textContent = 'бот не настроен';
      botLink.style.display = 'inline-flex';
    }
  }
  if (botHint) {
    botHint.textContent = TG_BOT_USERNAME
      ? `После получения доступа обязательно напишите боту @${TG_BOT_USERNAME}. Все дальнейшие уведомления по подписке будут приходить туда.`
      : 'После получения доступа напишите вашему Telegram-боту. Все дальнейшие уведомления по подписке будут приходить туда.';
  }
  clearMessage('purchaseModalMessage');
  clearMessage('modalPaymentMessage');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  if (usernameInput) usernameInput.focus();
}

function openVoucherSection() {
  const section = document.getElementById('voucher');
  if (!section) return;
  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function switchPurchaseStep(step) {
  const start = document.getElementById('purchaseStepStart');
  const gift = document.getElementById('purchaseStepGift');
  const payment = document.getElementById('purchaseStepPayment');
  const status = document.getElementById('purchaseStepStatus');
  const planSummary = document.getElementById('purchasePlanSummary');

  if (!start || !gift || !payment || !status || !planSummary) return;

  start.style.display = 'none';
  gift.style.display = 'none';
  payment.style.display = 'none';
  status.style.display = 'none';
  planSummary.style.display = 'block';

  if (step === 'gift') {
    gift.style.display = 'block';
    return;
  }

  if (step === 'payment') {
    planSummary.style.display = 'none';
    payment.style.display = 'block';
    return;
  }

  if (step === 'status') {
    planSummary.style.display = 'none';
    status.style.display = 'block';
    return;
  }

  start.style.display = 'block';
}

function openPaymentStep() {
  const subtitle = document.getElementById('purchaseModalSubtitle');
  if (subtitle) {
    subtitle.textContent = 'Реквизиты оплаты. После оплаты нажмите подтверждение ниже.';
  }
  clearMessage('modalGiftMessage');
  switchPurchaseStep('payment');
}

async function cancelPendingPaymentIfNeeded() {
  if (!currentPayment || paymentMarkedSent) return;

  try {
    await fetch(`${API_URL}/payments/${currentPayment.paymentId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'modal_closed' })
    });
  } catch (error) {
    console.error('Failed to cancel pending payment:', error);
  }

  currentPayment = null;
}

async function closePurchaseModal() {
  const modal = document.getElementById('purchaseModal');
  const usernameInput = document.getElementById('purchaseUsername');
  const giftLinkBox = document.getElementById('modalGiftLinkBox');
  const giftLinkValue = document.getElementById('modalGiftLinkValue');
  if (!modal) return;

  await cancelPendingPaymentIfNeeded();

  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  switchPurchaseStep('start');
  clearMessage('purchaseModalMessage');
  clearMessage('modalGiftMessage');
  clearMessage('modalPaymentMessage');
  if (giftLinkBox) giftLinkBox.style.display = 'none';
  if (giftLinkValue) giftLinkValue.textContent = '';
  if (usernameInput) {
    usernameInput.value = '';
  }
  paymentMarkedSent = false;
}

async function createPaymentRequest() {
  if (!selectedPlan) {
    showMessage('purchaseModalMessage', 'Сначала выберите тариф', 'error');
    return;
  }

  const usernameInput = document.getElementById('purchaseUsername');
  const rawUsername = usernameInput?.value?.trim() || '';
  const normalizedUsername = rawUsername.replace(/^@/, '');

  if (!normalizedUsername) {
    showMessage('purchaseModalMessage', '❌ Укажите Telegram username (например: @nikitoskaaaa)', 'error');
    return;
  }

  try {
    const createBtn = document.getElementById('purchaseCreateButton');
    setButtonLoading(createBtn, true, 'Создаём заявку...');

    const paymentResponse = await fetch(`${API_URL}/payments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: `@${normalizedUsername}`,
        username: normalizedUsername,
        planId: selectedPlan.id,
        firstName: normalizedUsername,
        lastName: '',
        browserFingerprint: getBrowserFingerprint()
      })
    });

    if (!paymentResponse.ok) {
      const err = await paymentResponse.json().catch(() => ({ error: 'Failed to create payment' }));
      throw new Error(err.error || 'Failed to create payment');
    }

    currentPayment = await paymentResponse.json();
    setStoredUsername(normalizedUsername);
    renderModalPaymentDetails(selectedPlan);
    const subtitle = document.getElementById('purchaseModalSubtitle');
    const giftLinkBox = document.getElementById('modalGiftLinkBox');
    const giftLinkValue = document.getElementById('modalGiftLinkValue');
    const hasNewTrial = Boolean(currentPayment.trial?.granted);
    if (subtitle) {
      subtitle.textContent = hasNewTrial
        ? 'Отлично. Сначала коротко про ваш доступ и установку.'
        : 'Реквизиты оплаты. После оплаты нажмите подтверждение ниже.';
    }

    const trialText = document.getElementById('modalGiftTrialText');
    const accessLink = currentPayment.trial?.subscriptionUrl || currentPayment.accessLink;

    if (currentPayment.trial?.granted) {
      const trialExpires = new Date(currentPayment.trial.expiresAt).toLocaleString('ru-RU');
      if (trialText) {
        trialText.textContent =
          `Как обещали: пробный доступ уже активирован до ${trialExpires}. После оплаты мы просто продлим текущий сертификат и подписку без смены ссылки.`;
      }
    } else {
      if (trialText) {
        trialText.textContent =
          'Пробный доступ уже выдавался ранее. После оплаты мы продлим ваш текущий сертификат и срок подписки.';
      }
    }

    if (giftLinkBox && giftLinkValue) {
      if (accessLink) {
        giftLinkBox.style.display = 'block';
        giftLinkValue.textContent = accessLink;
      } else {
        giftLinkBox.style.display = 'none';
        giftLinkValue.textContent = '';
      }
    }

    if (hasNewTrial) {
      switchPurchaseStep('gift');
    } else {
      clearMessage('modalGiftMessage');
      switchPurchaseStep('payment');
      if (currentPayment.trial?.blocked) {
        showMessage('modalPaymentMessage', 'ℹ️ Пробный доступ временно недоступен: ' + currentPayment.trial.reason, 'info');
      }
    }
  } catch (error) {
    console.error('Error creating payment:', error);
    showMessage('purchaseModalMessage', `❌ Ошибка создания заявки: ${error.message}`, 'error');
  } finally {
    const createBtn = document.getElementById('purchaseCreateButton');
    setButtonLoading(createBtn, false, 'Создаём заявку...');
  }
}

function showPurchaseStatus(type, title, text) {
  const icon = document.getElementById('purchaseStatusIcon');
  const titleEl = document.getElementById('purchaseStatusTitle');
  const textEl = document.getElementById('purchaseStatusText');
  const panel = document.getElementById('purchaseStatusPanel');

  if (!icon || !titleEl || !textEl || !panel) return;

  panel.className = `purchase-status ${type}`;
  icon.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  titleEl.textContent = title;
  textEl.textContent = text;
  switchPurchaseStep('status');
}

async function copyGiftAccessLink() {
  const value = document.getElementById('modalGiftLinkValue')?.textContent?.trim();
  if (!value) {
    showMessage('modalGiftMessage', '❌ Ссылка пока недоступна', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showMessage('modalGiftMessage', '✅ Ссылка скопирована', 'success');
  } catch {
    showMessage('modalGiftMessage', '❌ Не удалось скопировать ссылку', 'error');
  }
}

function renderModalPaymentDetails(plan) {
  const details = document.getElementById('modalPaymentDetails');
  if (!details) return;

  details.innerHTML = `
    <div class="detail-item">
      <span class="detail-label">Тариф:</span>
      <span class="detail-value">${plan.title}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Срок действия:</span>
      <span class="detail-value">${plan.days} дней</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Сумма к оплате:</span>
      <span class="detail-value" style="color: var(--primary); font-size: 24px; font-weight: 800;">
        ${plan.price} ₽
      </span>
    </div>
  `;

  const modalAmount = document.getElementById('modalPaymentAmount');
  if (modalAmount) {
    modalAmount.textContent = `${plan.price} ₽`;
  }

  const legacyAmount = document.getElementById('legacyPaymentAmount');
  if (legacyAmount) {
    legacyAmount.textContent = `${plan.price} ₽`;
  }
}

// Подтвердить платёж
async function confirmPayment() {
  if (!currentPayment) {
    showPurchaseStatus('error', 'Заявка не найдена', 'Сначала создайте заявку на оплату, затем подтвердите перевод.');
    return;
  }

  paymentMarkedSent = true;
  showPurchaseStatus(
    'success',
    'Заявка отправлена на проверку',
    'После подтверждения администратором подписка будет продлена, а уведомление придёт в Telegram.'
  );
}

// Вернуться к тарифам
function backToPlans() {
  selectedPlan = null;
  currentPayment = null;
  closePurchaseModal();
}

// Активировать ваучер
async function activateVoucher() {
  const code = document.getElementById('voucherCode').value.trim().toUpperCase();
  const storedUsername = getStoredUsername();

  if (!code) {
    showMessage('voucherMessage', '❌ Введите код ваучера', 'error');
    return;
  }

  const voucherRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!voucherRegex.test(code)) {
    showMessage('voucherMessage', '❌ Неверный формат кода. Используйте: XXXX-XXXX-XXXX-XXXX', 'error');
    return;
  }

  if (!storedUsername) {
    showMessage('voucherMessage', '❌ Сначала создайте заявку на оплату, чтобы привязать Telegram username', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/vouchers/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        username: storedUsername
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const result = await response.json();
    
    showMessage('voucherMessage', 
      `✅ Ваучер активирован!\\n${result.planTitle}\\nДействителен до: ${new Date(result.expiresAt).toLocaleString('ru-RU')}`, 
      'success'
    );

    // Очистить поле
    document.getElementById('voucherCode').value = '';
    
    setTimeout(() => clearMessage('voucherMessage'), 5000);
  } catch (error) {
    console.error('Error:', error);
    
    let errorMsg = '❌ Ошибка активации';
    if (error.message.includes('not found')) errorMsg = '❌ Ваучер не найден';
    if (error.message.includes('not active')) errorMsg = '❌ Ваучер неактивен или уже использован';
    if (error.message.includes('bound')) errorMsg = '❌ Этот ваучер привязан к другому Telegram username';
    
    showMessage('voucherMessage', errorMsg, 'error');
  }
}

// Вспомогательные функции
function showMessage(elementId, text, type) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`;
  element.style.display = 'block';
}

function clearMessage(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = '';
  element.className = 'message';
  element.style.display = 'none';
}

// Обработка Enter в поле ввода ваучера
document.addEventListener('DOMContentLoaded', () => {
  const voucherInput = document.getElementById('voucherCode');
  if (voucherInput) {
    voucherInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        activateVoucher();
      }
    });
  }

  const purchaseModal = document.getElementById('purchaseModal');
  const purchaseUsername = document.getElementById('purchaseUsername');

  if (purchaseModal) {
    purchaseModal.addEventListener('click', (e) => {
      if (e.target === purchaseModal) {
        closePurchaseModal();
      }
    });
  }

  if (purchaseUsername) {
    purchaseUsername.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        createPaymentRequest();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePurchaseModal();
    }
  });
});
