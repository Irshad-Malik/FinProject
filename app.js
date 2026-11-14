const defaultTransactions = [
  { id: 1, type: 'income', title: 'Salary deposit', category: 'Salary', amount: 4200, date: '2026-11-01' },
  { id: 2, type: 'income', title: 'Freelance design', category: 'Freelance', amount: 680, date: '2026-11-04' },
  { id: 3, type: 'expense', title: 'Apartment rent', category: 'Housing', amount: 1450, date: '2026-11-02' },
  { id: 4, type: 'expense', title: 'Grocery run', category: 'Food', amount: 420, date: '2026-11-05' },
  { id: 5, type: 'expense', title: 'Fuel refill', category: 'Transport', amount: 180, date: '2026-11-07' },
  { id: 6, type: 'expense', title: 'Internet & utilities', category: 'Utilities', amount: 96, date: '2026-11-08' },
  { id: 7, type: 'expense', title: 'Emergency fund transfer', category: 'Savings', amount: 500, date: '2026-11-10' },
  { id: 8, type: 'expense', title: 'Weekend dining', category: 'Shopping', amount: 240, date: '2026-11-12' }
];

const themeToggle = document.getElementById('themeToggle');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');

const defaultBudgets = [
  { category: 'Housing', spent: 1450, limit: 1800, color: '#4f46e5' },
  { category: 'Food', spent: 420, limit: 550, color: '#10b981' },
  { category: 'Transport', spent: 180, limit: 260, color: '#f59e0b' },
  { category: 'Utilities', spent: 96, limit: 220, color: '#ec4899' },
  { category: 'Savings', spent: 500, limit: 900, color: '#8b5cf6' }
];

const defaultGoals = [
  { name: 'Emergency fund', current: 14200, target: 20000, color: '#10b981' },
  { name: 'Vacation', current: 4600, target: 8000, color: '#4f46e5' },
  { name: 'New laptop', current: 1200, target: 2500, color: '#f59e0b' }
];

const currencySelector = document.getElementById('currencySelector');

const state = {
  currency: localStorage.getItem('flux-currency') || 'USD',
  transactions: loadTransactions(),
  budgets: defaultBudgets,
  goals: defaultGoals
};

const formatCurrency = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: state.currency,
  maximumFractionDigits: state.currency === 'JPY' ? 0 : 0
}).format(value);

function loadTransactions() {
  const saved = localStorage.getItem('flux-finance-transactions');
  return saved ? JSON.parse(saved) : defaultTransactions;
}

function saveTransactions() {
  localStorage.setItem('flux-finance-transactions', JSON.stringify(state.transactions));
}

function getIncomeTotal() {
  return state.transactions
    .filter((entry) => entry.type === 'income')
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
}

function getExpenseTotal() {
  return state.transactions
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
}

function getTotalBalance() {
  return getIncomeTotal() - getExpenseTotal();
}

function getSavingsRate() {
  const income = getIncomeTotal();
  if (!income) return 0;
  return Math.round((getExpenseTotal() / income) * 100);
}

function buildSparkline(values, color = '#5b4bda') {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  });

  return `M ${points
    .map((point) => point.replace(',', ' '))
    .join(' L ')}`;
}

function renderSummary() {
  const income = getIncomeTotal();
  const expenses = getExpenseTotal();
  const balance = getTotalBalance();
  const rate = Math.max(0, 100 - getSavingsRate());

  const balanceSeries = [balance - 500, balance - 240, balance - 90, balance, balance + 150, balance + 210, balance + 260];
  const incomeSeries = [income - 1800, income - 900, income - 300, income, income + 260, income + 520, income + 700];
  const expenseSeries = [expenses - 500, expenses - 230, expenses - 140, expenses - 80, expenses, expenses + 100, expenses + 200];

  document.getElementById('metricBalance').textContent = formatCurrency(balance);
  document.getElementById('metricIncome').textContent = formatCurrency(income);
  document.getElementById('metricExpenses').textContent = formatCurrency(expenses);
  document.getElementById('balanceSpark').setAttribute('d', buildSparkline(balanceSeries, '#5b4bda'));
  document.getElementById('incomeSpark').setAttribute('d', buildSparkline(incomeSeries, '#2fb7a6'));
  document.getElementById('expenseSpark').setAttribute('d', buildSparkline(expenseSeries, '#ef5a6f'));

  document.getElementById('totalBalance').textContent = formatCurrency(balance);
  document.getElementById('monthlyIncome').textContent = formatCurrency(income);
  document.getElementById('monthlyExpenses').textContent = formatCurrency(expenses);
  document.getElementById('savingsRate').textContent = `${rate}%`;
  document.getElementById('sideBalance').textContent = formatCurrency(balance);
  document.getElementById('sideSaved').textContent = formatCurrency(Math.max(0, balance));
}

function renderChart() {
  const categories = {
    Housing: 0,
    Food: 0,
    Transport: 0,
    Utilities: 0,
    Shopping: 0,
    Savings: 0
  };

  state.transactions
    .filter((entry) => entry.type === 'expense')
    .forEach((entry) => {
      categories[entry.category] = (categories[entry.category] || 0) + Number(entry.amount);
    });

  const labels = Object.keys(categories);
  const values = Object.values(categories);

  const themeIsDark = document.body.classList.contains('dark');
  if (window.Chart) {
    const chartCanvas = document.getElementById('spendingChart');
    if (chartCanvas._chartInstance) {
      chartCanvas._chartInstance.destroy();
    }

    chartCanvas._chartInstance = new Chart(chartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#38bdf8'],
          borderRadius: 12,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (context) => formatCurrency(context.parsed.y) } }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: themeIsDark ? '#cbd5e1' : '#475569' }
          },
          y: {
            beginAtZero: true,
            grid: { color: themeIsDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.12)' },
            ticks: { color: themeIsDark ? '#cbd5e1' : '#475569', callback: (value) => formatCurrency(value) }
          }
        }
      }
    });
  }
}

function renderBudgets() {
  const budgetList = document.getElementById('budgetList');
  budgetList.innerHTML = state.budgets
    .map((item) => {
      const percent = Math.min((item.spent / item.limit) * 100, 100);
      const level = percent >= 90 ? 'warning' : 'success';
      return `
        <div class="budget-item">
          <div class="budget-top">
            <div class="budget-meta">
              <span class="dot" style="background:${item.color};"></span>
              <strong>${item.category}</strong>
            </div>
            <strong>${formatCurrency(item.spent)} / ${formatCurrency(item.limit)}</strong>
          </div>
          <div class="progress">
            <div class="progress-bar ${level}" style="width:${percent}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderGoals() {
  const goalList = document.getElementById('goalList');
  goalList.innerHTML = state.goals
    .map((goal) => {
      const percent = Math.min((goal.current / goal.target) * 100, 100);
      return `
        <div class="goal-item">
          <div class="goal-top">
            <div class="goal-meta">
              <span class="dot" style="background:${goal.color};"></span>
              <strong>${goal.name}</strong>
            </div>
            <span>${Math.round(percent)}%</span>
          </div>
          <div class="progress">
            <div class="progress-bar success" style="width:${percent}%"></div>
          </div>
          <div class="goal-summary">
            <small>${formatCurrency(goal.current)} saved</small>
            <small>${formatCurrency(goal.target)} target</small>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderTransactions() {
  const transactionList = document.getElementById('transactionList');
  const entries = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  transactionList.innerHTML = entries
    .slice(0, 7)
    .map((entry) => {
      const sign = entry.type === 'income' ? '+' : '-';
      const amount = `${sign}${formatCurrency(entry.amount)}`;
      return `
        <div class="tx-row">
          <div class="tx-main">
            <div class="tx-icon ${entry.type === 'income' ? 'income' : 'expense'}">${entry.type === 'income' ? '↑' : '↓'}</div>
            <div class="tx-meta">
              <strong>${entry.title}</strong>
              <span>${entry.category} • ${entry.date}</span>
            </div>
          </div>
          <div class="tx-amount ${entry.type}">${amount}</div>
        </div>
      `;
    })
    .join('');
}

function handleTransactionSubmit(event) {
  event.preventDefault();

  const type = document.getElementById('transactionType').value;
  const category = document.getElementById('transactionCategory').value;
  const title = document.getElementById('transactionTitle').value.trim();
  const amount = Number(document.getElementById('transactionAmount').value);

  if (!title || Number.isNaN(amount) || amount <= 0) {
    return;
  }

  const entry = {
    id: Date.now(),
    type,
    category,
    title,
    amount,
    date: new Date().toISOString().slice(0, 10)
  };

  state.transactions.push(entry);
  saveTransactions();
  event.target.reset();
  renderApp();
}

function applyTheme(mode) {
  const isDark = mode === 'dark';
  document.body.classList.toggle('dark', isDark);
  localStorage.setItem('flux-theme', mode);
  themeToggle.textContent = isDark ? '☀️ Light' : '🌙 Dark';
  renderChart();
}

function toggleTheme() {
  const nextMode = document.body.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(nextMode);
}

function syncAuthUI() {
  const isLoggedIn = localStorage.getItem('flux-auth') === 'true';
  loginModal.classList.toggle('hidden', isLoggedIn);
  document.querySelector('.app-shell').style.filter = isLoggedIn ? 'none' : 'blur(2px)';
}

function handleLogin(event) {
  event.preventDefault();
  localStorage.setItem('flux-auth', 'true');
  syncAuthUI();
}

function handleLogout() {
  localStorage.setItem('flux-auth', 'false');
  syncAuthUI();
}

function renderApp() {
  renderSummary();
  renderChart();
  renderBudgets();
  renderGoals();
  renderTransactions();
}

function updateCurrency() {
  state.currency = currencySelector.value;
  localStorage.setItem('flux-currency', state.currency);
  renderApp();
}

themeToggle.addEventListener('click', toggleTheme);
currencySelector.addEventListener('change', updateCurrency);
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
document.getElementById('transactionForm').addEventListener('submit', handleTransactionSubmit);

currencySelector.value = state.currency;
const initialTheme = localStorage.getItem('flux-theme') || 'light';
applyTheme(initialTheme);
syncAuthUI();
renderApp();
