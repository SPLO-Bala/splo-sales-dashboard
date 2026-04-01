
const state = {
  rawRows: [],
  filteredRows: [],
  charts: {}
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.-]+/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function titleCase(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function safeService(input) {
  return String(input || '').trim().replace(/\s+/g, ' ') || 'Unknown';
}

function parseDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) {
    const [, m, d, y] = parts;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const native = new Date(str);
  return Number.isNaN(native.getTime()) ? null : native;
}

function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric'
  });
}

function formatCurrency(value) {
  return currency.format(value || 0);
}

function summarizeBy(rows, keyGetter) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyGetter(row);
    if (!map.has(key)) {
      map.set(key, {
        label: key,
        revenue: 0,
        deposits: 0,
        deals: 0
      });
    }
    const item = map.get(key);
    item.revenue += row.kValue;
    item.deposits += row.initialDeposit;
    item.deals += 1;
  });
  return Array.from(map.values()).map(item => ({
    ...item,
    avgDeal: item.deals ? item.revenue / item.deals : 0
  }));
}

function sortDesc(arr, field) {
  return [...arr].sort((a, b) => (b[field] || 0) - (a[field] || 0));
}

function populateFilters(rows) {
  const acmFilter = document.getElementById('acmFilter');
  const serviceFilter = document.getElementById('serviceFilter');

  const acms = [...new Set(rows.map(r => r.acm))].sort();
  const services = [...new Set(rows.map(r => r.service))].sort((a, b) => a.localeCompare(b));

  acmFilter.innerHTML = '<option value="All">All ACMs</option>' +
    acms.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');

  serviceFilter.innerHTML = '<option value="All">All services</option>' +
    services.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');

  const dates = rows.map(r => r.date).filter(Boolean).sort((a, b) => a - b);
  if (dates.length) {
    document.getElementById('dateFrom').value = toInputDate(dates[0]);
    document.getElementById('dateTo').value = toInputDate(dates[dates.length - 1]);
  }
}

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function applyFilters() {
  const acmValue = document.getElementById('acmFilter').value;
  const serviceValue = document.getElementById('serviceFilter').value;
  const dateFrom = document.getElementById('dateFrom').value ? new Date(document.getElementById('dateFrom').value + 'T00:00:00') : null;
  const dateTo = document.getElementById('dateTo').value ? new Date(document.getElementById('dateTo').value + 'T23:59:59') : null;

  state.filteredRows = state.rawRows.filter(row => {
    const passAcm = acmValue === 'All' || row.acm === acmValue;
    const passService = serviceValue === 'All' || row.service === serviceValue;
    const passFrom = !dateFrom || (row.date && row.date >= dateFrom);
    const passTo = !dateTo || (row.date && row.date <= dateTo);
    return passAcm && passService && passFrom && passTo;
  });

  renderDashboard();
}

function updateKPIs(rows) {
  const totalRevenue = rows.reduce((sum, r) => sum + r.kValue, 0);
  const totalDeposits = rows.reduce((sum, r) => sum + r.initialDeposit, 0);
  const deals = rows.length;
  const avgDeal = deals ? totalRevenue / deals : 0;
  const depositPct = totalRevenue ? (totalDeposits / totalRevenue) * 100 : 0;
  const avgDepositPct = depositPct;

  setText('kpiRevenue', formatCurrency(totalRevenue));
  setText('kpiRevenueFoot', `${formatCurrency(totalDeposits)} collected upfront, ${depositPct.toFixed(1)}% deposit rate`);

  setText('kpiDeposits', formatCurrency(totalDeposits));
  setText('kpiDepositsFoot', `${deals} total deals included in this view`);

  setText('kpiDeals', deals.toLocaleString('en-US'));
  setText('kpiDealsFoot', `${deals ? Math.round(deals / Math.max(new Set(rows.map(r => r.monthKey)).size, 1)) : 0} average deals per active month`);

  setText('kpiAvgDeal', formatCurrency(avgDeal));
  setText('kpiAvgDealFoot', `${rows.length ? formatCurrency(Math.max(...rows.map(r => r.kValue))) : '$0'} largest retainer`);

  setText('kpiAvgDepositPct', `${avgDepositPct.toFixed(1)}%`);
  setText('kpiAvgDepositPctFoot', `${formatCurrency(totalDeposits)} of ${formatCurrency(totalRevenue)} collected upfront`);
}

function renderRecentRetainers(rows) {
  const body = document.getElementById('recentRetainersBody');
  const recent = [...rows]
    .filter(r => r.date)
    .sort((a, b) => b.date - a.date)
    .slice(0, 25);

  body.innerHTML = recent.map(row => `
    <tr>
      <td>${escapeHtml(row.customer)}</td>
      <td><span class="badge">${escapeHtml(row.service)}</span></td>
      <td>${row.date ? row.date.toLocaleDateString('en-US') : '-'}</td>
      <td>${escapeHtml(row.acm)}</td>
      <td class="num">${formatCurrency(row.kValue)}</td>
      <td class="num">${formatCurrency(row.initialDeposit)}</td>
    </tr>
  `).join('');
}

function aggregateMonthly(rows) {
  const summary = summarizeBy(rows, r => r.monthKey)
    .filter(item => item.label && item.label !== 'Unknown')
    .sort((a, b) => a.label.localeCompare(b.label));
  return {
    labels: summary.map(item => monthLabel(item.label)),
    revenue: summary.map(item => item.revenue),
    deposits: summary.map(item => item.deposits),
    deals: summary.map(item => item.deals)
  };
}

function createOrUpdateChart(key, canvasId, configBuilder) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (state.charts[key]) state.charts[key].destroy();
  state.charts[key] = new Chart(ctx, configBuilder(ctx));
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#d7e7ff',
          font: { family: 'Inter', weight: '600' }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(8, 15, 28, 0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: '#d9e6fb',
        padding: 12
      }
    },
    scales: {
      x: {
        ticks: { color: '#afc5e7' },
        grid: { color: 'rgba(255,255,255,0.04)' }
      },
      y: {
        ticks: { color: '#afc5e7' },
        grid: { color: 'rgba(255,255,255,0.05)' }
      }
    }
  };
}

function renderCharts(rows) {
  const monthly = aggregateMonthly(rows);
  const acm = sortDesc(summarizeBy(rows, r => r.acm), 'revenue');
  const service = sortDesc(summarizeBy(rows, r => r.service), 'revenue').slice(0, 12);

  createOrUpdateChart('monthlyRevenue', 'monthlyRevenueChart', () => ({
    type: 'line',
    data: {
      labels: monthly.labels,
      datasets: [{
        label: 'Contract Value',
        data: monthly.revenue,
        borderColor: '#61b0ff',
        backgroundColor: 'rgba(97,176,255,0.16)',
        fill: true,
        tension: 0.32,
        borderWidth: 3,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: chartOptions()
  }));

  createOrUpdateChart('monthlyDeposit', 'monthlyDepositChart', () => ({
    type: 'line',
    data: {
      labels: monthly.labels,
      datasets: [{
        label: 'Initial Deposits',
        data: monthly.deposits,
        borderColor: '#7af8c1',
        backgroundColor: 'rgba(122,248,193,0.16)',
        fill: true,
        tension: 0.32,
        borderWidth: 3,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: chartOptions()
  }));

  createOrUpdateChart('monthlyDeals', 'monthlyDealsChart', () => ({
    type: 'bar',
    data: {
      labels: monthly.labels,
      datasets: [{
        label: 'Deals',
        data: monthly.deals,
        backgroundColor: 'rgba(122,248,193,0.7)',
        borderColor: '#7af8c1',
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 34
      }]
    },
    options: chartOptions()
  }));

  createOrUpdateChart('revenueByAcm', 'revenueByAcmChart', () => ({
    type: 'bar',
    data: {
      labels: acm.map(x => x.label),
      datasets: [{
        label: 'Revenue',
        data: acm.map(x => x.revenue),
        backgroundColor: 'rgba(127,140,255,0.72)',
        borderColor: '#a9b4ff',
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 36
      }]
    },
    options: chartOptions()
  }));

  createOrUpdateChart('dealsByAcm', 'dealsByAcmChart', () => ({
    type: 'bar',
    data: {
      labels: acm.map(x => x.label),
      datasets: [{
        label: 'Deals',
        data: acm.map(x => x.deals),
        backgroundColor: 'rgba(97,176,255,0.72)',
        borderColor: '#cfe5ff',
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 36
      }]
    },
    options: chartOptions()
  }));

  createOrUpdateChart('avgDealByAcm', 'avgDealByAcmChart', () => ({
    type: 'bar',
    data: {
      labels: acm.map(x => x.label),
      datasets: [{
        label: 'Average Deal Size',
        data: acm.map(x => x.avgDeal),
        backgroundColor: 'rgba(255,182,72,0.72)',
        borderColor: '#ffd56e',
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 36
      }]
    },
    options: chartOptions()
  }));

  createOrUpdateChart('revenueByService', 'revenueByServiceChart', () => ({
    type: 'bar',
    data: {
      labels: service.map(x => x.label),
      datasets: [{
        label: 'Revenue',
        data: service.map(x => x.revenue),
        backgroundColor: 'rgba(33,212,200,0.7)',
        borderColor: '#61f4e4',
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 28
      }]
    },
    options: {
      ...chartOptions(),
      indexAxis: 'y'
    }
  }));
}

function renderDashboard() {
  updateKPIs(state.filteredRows);
  renderCharts(state.filteredRows);
  renderRecentRetainers(state.filteredRows);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadData() {
  const result = await fetch('data.csv');
  const text = await result.text();
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true
  });

  state.rawRows = parsed.data.map(row => {
    const date = parseDate(row['Date Retained']);
    const kValue = parseMoney(row['K Value']);
    const initialDeposit = parseMoney(row['Initial Deposit']);
    return {
      customer: String(row['Customer Name'] || '').trim() || 'Unknown',
      service: safeService(row['Service Retained (Main)']),
      date,
      monthKey: date ? monthKey(date) : 'Unknown',
      kValue,
      initialDeposit,
      acm: titleCase(row['ACM'] || 'Unknown')
    };
  }).filter(row => row.customer || row.service || row.kValue || row.initialDeposit);

  populateFilters(state.rawRows);
  state.filteredRows = [...state.rawRows];
  renderDashboard();
}

function attachEvents() {
  ['acmFilter', 'serviceFilter', 'dateFrom', 'dateTo'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  attachEvents();
  try {
    await loadData();
  } catch (error) {
    console.error(error);
  }
});
