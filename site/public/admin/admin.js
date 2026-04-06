const APP_CONFIG = window.APP_CONFIG || {};
const API_URL = APP_CONFIG.apiUrl || '/api';

let adminToken = null;
let allPayments = { pending: [], confirmed: [] };
let allVouchers = [];
let allPlans = [];

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  // Проверить авторизацию
  const token = sessionStorage.getItem('adminToken');
  if (!token) {
    showLoginForm();
  } else {
    adminToken = token;
    initializeAdmin();
  }
});

// Форма входа
function showLoginForm() {
  document.body.innerHTML = `
    <div class="login-wrapper">
      <div class="login-container glass-effect">
        <div style="text-align: center; margin-bottom: 40px;">
          <span style="font-size: 48px; display: block; margin-bottom: 15px;">🛡️</span>
          <h1 style="margin-bottom: 10px;">Админ-панель</h1>
          <p style="color: var(--text-secondary);">Введите пароль для входа</p>
        </div>

        <form onsubmit="handleLogin(event)">
          <div class="form-group">
            <input 
              type="password" 
              id="adminPassword" 
              class="input-field"
              placeholder="Пароль администратора"
              autofocus
            >
          </div>
          <button type="submit" class="btn btn-primary btn-large">
            🔓 Вход
          </button>
          <div id="loginMessage" class="message" style="margin-top: 15px;"></div>
        </form>
      </div>
    </div>

    <style>
      .login-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }

      .login-container {
        width: 100%;
        max-width: 400px;
        padding: 50px;
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 24px;
      }

      .login-container h1 {
        font-size: 32px;
        font-weight: 800;
        background: linear-gradient(135deg, #fff 0%, var(--primary-light) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
    </style>
  `;
}

async function handleLogin(event) {
  event.preventDefault();
  
  const password = document.getElementById('adminPassword').value;
  if (!password) {
    showMessage('loginMessage', '❌ Введите пароль', 'error');
    return;
  }

  try {
    // Создать token
    const token = btoa(JSON.stringify({ password, adminId: 'admin' }));
    
    // Проверить токен запросом к API
    const response = await fetch(`${API_URL}/admin/payments`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 403 || response.status === 401) {
      showMessage('loginMessage', '❌ Неверный пароль', 'error');
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to verify');
    }

    // Сохранить токен
    sessionStorage.setItem('adminToken', token);
    adminToken = token;

    // Перезагрузить страницу
    location.reload();
  } catch (error) {
    showMessage('loginMessage', '❌ Ошибка: ' + error.message, 'error');
  }
}

// Инициализация админ-панели
async function initializeAdmin() {
  try {
    // Загрузить тарифы
    const plansRes = await fetch(`${API_URL}/plans`);
    allPlans = await plansRes.json();
    populatePlanSelect();

    // Загрузить платежи
    await loadPayments();

    // Загрузить ваучеры
    await loadVouchers();

    // Обновлять данные каждые 5 секунд
    setInterval(async () => {
      await loadPayments();
      updateStats();
    }, 5000);

    updateStats();
  } catch (error) {
    console.error('Error initializing:', error);
    alert('Ошибка инициализации: ' + error.message);
  }
}

// Загрузить платежи
async function loadPayments() {
  try {
    const response = await fetch(`${API_URL}/admin/payments`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (!response.ok) throw new Error('Failed to load payments');
    
    allPayments = await response.json();
    renderPayments();
  } catch (error) {
    console.error('Error loading payments:', error);
  }
}

// Загрузить ваучеры
async function loadVouchers() {
  // В данной версии ваучеры хранятся в БД
  // Здесь можно добавить запрос к API для получения списка
  try {
    // Временно - показать пустой список
    renderVouchers();
  } catch (error) {
    console.error('Error loading vouchers:', error);
  }
}

// Отобразить платежи
function renderPayments() {
  // Ожидающие платежи
  const pendingHTML = allPayments.pending.map(payment => `
    <div class="payment-item">
      <div class="payment-info">
        <div class="payment-user">👤 Пользователь #${payment.userId}</div>
        <div class="payment-details-row">
          <div class="payment-details-item">💳 ${payment.planTitle}</div>
          <div class="payment-details-item">💰 ${payment.amount} ₽</div>
          <div class="payment-details-item">⏰ ${new Date(payment.createdAt).toLocaleString('ru-RU')}</div>
        </div>
      </div>
      <div class="payment-actions">
        <span class="payment-status status-pending">Ожидает</span>
        <button class="confirm-button" onclick="confirmPayment('${payment.id}')">
          ✅ Подтвердить
        </button>
      </div>
    </div>
  `).join('');

  document.getElementById('pending-payments-tab').innerHTML = pendingHTML || 
    '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">Нет ожидающих платежей</p>';

  // Подтверждённые платежи
  const confirmedHTML = allPayments.confirmed.map(payment => `
    <div class="payment-item">
      <div class="payment-info">
        <div class="payment-user">👤 Пользователь #${payment.userId}</div>
        <div class="payment-details-row">
          <div class="payment-details-item">💳 ${payment.planTitle}</div>
          <div class="payment-details-item">💰 ${payment.amount} ₽</div>
          <div class="payment-details-item">✅ ${new Date(payment.confirmedAt).toLocaleString('ru-RU')}</div>
        </div>
      </div>
      <div class="payment-actions">
        <span class="payment-status status-confirmed">Подтверждено</span>
      </div>
    </div>
  `).join('');

  document.getElementById('confirmed-payments-tab').innerHTML = confirmedHTML || 
    '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">Нет подтверждённых платежей</p>';

  // Обновить счётчики
  document.querySelector('[onclick="switchPaymentsTab(\'pending\')"]').textContent = 
    `⏳ Ожидающие (${allPayments.pending.length})`;
  document.querySelector('[onclick="switchPaymentsTab(\'confirmed\')"]').textContent = 
    `✅ Подтверждённые (${allPayments.confirmed.length})`;
}

// Отобразить ваучеры
function renderVouchers() {
  const vouchersHTML = `
    <p style="color: var(--text-secondary); text-align: center; padding: 40px;">
      Ваучеры отображаются в разделе "Создать ваучер"
    </p>
  `;
  document.getElementById('vouchers-list').innerHTML = vouchersHTML;
}

// Подтвердить платёж
async function confirmPayment(paymentId) {
  if (!confirm('Подтвердить платёж и сразу продлить подписку?')) return;

  try {
    const response = await fetch(`${API_URL}/admin/payments/${paymentId}/confirm`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (!response.ok) throw new Error('Failed to confirm payment');

    const result = await response.json();
    alert(
      `✅ Платёж подтвержден!\\n` +
      `Продлено до: ${new Date(result.expiresAt).toLocaleString('ru-RU')}\\n` +
      `Ссылка: ${result.subscriptionUrl}`
    );
    
    await loadPayments();
    updateStats();
  } catch (error) {
    alert('❌ Ошибка: ' + error.message);
  }
}

// Создать ваучеры
async function createVouchers() {
  const planId = document.getElementById('planSelect').value;
  const quantity = parseInt(document.getElementById('voucherQuantity').value);

  if (!planId) {
    showMessage('createMessage', '❌ Выберите тариф', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/admin/vouchers/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ planId, quantity })
    });

    if (!response.ok) throw new Error('Failed to create vouchers');

    const result = await response.json();
    showMessage('createMessage', `✅ Создано ${quantity} ваучеров!`, 'success');

    // Показать коды
    const codesHTML = result.vouchers.map(v => `
      <div class="created-voucher-code">
        <span>${v.code}</span>
        <button class="copy-button" onclick="copyToClipboard('${v.code}')">
          📋 Копировать
        </button>
      </div>
    `).join('');

    document.getElementById('createdVouchers').innerHTML = `
      <div class="created-vouchers-title">📋 Созданные коды:</div>
      <div class="created-vouchers-list">
        ${codesHTML}
      </div>
    `;

    // Очистить форму
    document.getElementById('voucherQuantity').value = '1';
  } catch (error) {
    showMessage('createMessage', '❌ Ошибка: ' + error.message, 'error');
  }
}

// Копировать в буфер обмена
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('✅ Скопировано: ' + text);
  });
}

// Заполнить выбор тарифов
function populatePlanSelect() {
  const select = document.getElementById('planSelect');
  const targetSelect = document.getElementById('targetPlanSelect');
  if (!select && !targetSelect) return;

  const options = allPlans.map(plan => `
    <option value="${plan.id}">${plan.title} (${plan.price}₽)</option>
  `).join('');

  if (select) {
    select.innerHTML = '<option value="">-- Выберите тариф --</option>' + options;
  }
  if (targetSelect) {
    targetSelect.innerHTML = '<option value="">-- Выберите тариф --</option>' + options;
  }
}

async function createVoucherForUser() {
  const usernameRaw = document.getElementById('targetUsername').value.trim();
  const planId = document.getElementById('targetPlanSelect').value;

  if (!usernameRaw) {
    showMessage('createUserVoucherMessage', '❌ Укажите Telegram username', 'error');
    return;
  }
  if (!planId) {
    showMessage('createUserVoucherMessage', '❌ Выберите тариф', 'error');
    return;
  }

  const normalizedUsername = usernameRaw.replace(/^@/, '');

  try {
    const response = await fetch(`${API_URL}/admin/vouchers/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        planId,
        quantity: 1,
        username: normalizedUsername
      })
    });

    if (!response.ok) throw new Error('Failed to create voucher');

    const result = await response.json();
    const voucher = result.vouchers?.[0];

    showMessage('createUserVoucherMessage', `✅ Ваучер создан для @${normalizedUsername}`, 'success');
    document.getElementById('createdUserVoucher').innerHTML = voucher
      ? `
      <div class="created-vouchers-title">📋 Код для @${normalizedUsername}:</div>
      <div class="created-vouchers-list">
        <div class="created-voucher-code">
          <span>${voucher.code}</span>
          <button class="copy-button" onclick="copyToClipboard('${voucher.code}')">📋 Копировать</button>
        </div>
      </div>
      `
      : '';
  } catch (error) {
    showMessage('createUserVoucherMessage', `❌ Ошибка: ${error.message}`, 'error');
  }
}

// Переключение вкладок
function switchTab(tabName) {
  // Скрыть все вкладки
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));

  // Показать выбранную вкладку
  document.getElementById(`${tabName}-tab`).classList.add('active');
  document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
}

// Переключение подвкладок платежей
function switchPaymentsTab(tabName) {
  document.querySelectorAll('[id$="-payments-tab"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(`${tabName}-payments-tab`).style.display = 'block';
  event.target.classList.add('active');
}

// Поиск ваучеров
function searchVouchers() {
  const query = document.getElementById('voucherSearch').value.toUpperCase();
  // Реализация поиска
}

// Обновить статистику
function updateStats() {
  let totalAmount = 0;
  allPayments.confirmed.forEach(p => totalAmount += p.amount);

  document.getElementById('statTotalPayments').textContent = totalAmount + ' ₽';
  document.getElementById('statPendingPayments').textContent = allPayments.pending.length;
  document.getElementById('statConfirmedPayments').textContent = allPayments.confirmed.length;
  document.getElementById('statVouchers').textContent = 
    allPayments.confirmed.length; // Количество выданных ваучеров
}

// Выход
function logout() {
  if (confirm('Вы уверены?')) {
    sessionStorage.removeItem('adminToken');
    location.reload();
  }
}

// Вспомогательная функция
function showMessage(elementId, text, type) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
    element.className = `message ${type}`;
    element.style.display = 'block';
  }
}
