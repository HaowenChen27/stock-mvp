let previousScores = new Map();
let autoSyncTimer = null;
let autoSyncEnabled = false;

function setLastSyncTime() {
  const el = document.getElementById('lastSyncAt');
  if (el) el.textContent = new Date().toLocaleTimeString();
}

function diffBadge(current, previous) {
  if (previous === undefined) return '<span class="delta neutral">新</span>';
  const diff = current - previous;
  if (diff > 0) return `<span class="delta up">↑ ${diff}</span>`;
  if (diff < 0) return `<span class="delta down">↓ ${Math.abs(diff)}</span>`;
  return '<span class="delta neutral">→ 0</span>';
}

async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  const data = await res.json();

  document.getElementById('updatedAt').textContent = `更新时间：${new Date(data.updatedAt).toLocaleString()}`;

  document.getElementById('sectors').innerHTML = data.sectors.map(sector => `
    <div class="row">
      <strong>${sector.name}</strong>
      <span class="${sector.changePct >= 0 ? 'up' : 'down'}">${sector.changePct >= 0 ? '+' : ''}${sector.changePct.toFixed(2)}%</span>
    </div>
  `).join('');

  document.getElementById('comparisons').innerHTML = data.comparisons.map(item => `
    <div class="compare-row">
      <div>
        <div><strong>${item.title}</strong></div>
        <div class="muted">领先：${item.winner}</div>
      </div>
      <div class="${item.diff >= 0 ? 'up' : 'down'}">分差 ${item.diff}</div>
    </div>
  `).join('');

  document.getElementById('symbols').innerHTML = data.symbols.map(symbol => {
    const strengthClass = symbol.strengthLabel === '强' ? 'green' : symbol.strengthLabel === '中' ? 'yellow' : 'red';
    const previous = previousScores.get(symbol.code);
    const delta = diffBadge(symbol.score, previous);
    const scoreChanged = previous !== undefined && previous !== symbol.score;
    return `
      <div class="symbol-card ${scoreChanged ? 'pulse' : ''}">
        <div class="symbol-top">
          <div class="name-wrap">
            <h3>${symbol.name}</h3>
            <div class="code">${symbol.code} · ${symbol.watchNote || ''}</div>
          </div>
          <div class="score-wrap">
            <div class="score">${symbol.score}</div>
            ${delta}
            <span class="tag ${strengthClass}">${symbol.strengthLabel} / ${symbol.trendLabel}</span>
          </div>
        </div>
        <div class="metrics">
          <div class="metric"><div class="label">涨跌幅</div><div class="value ${symbol.changePct >= 0 ? 'up' : 'down'}">${symbol.changePct >= 0 ? '+' : ''}${symbol.changePct}%</div></div>
          <div class="metric"><div class="label">高开幅度</div><div class="value ${symbol.openPct >= 0 ? 'up' : 'down'}">${symbol.openPct >= 0 ? '+' : ''}${symbol.openPct}%</div></div>
          <div class="metric"><div class="label">板块均涨</div><div class="value">${symbol.avgSectorChangePct >= 0 ? '+' : ''}${symbol.avgSectorChangePct}%</div></div>
          <div class="metric"><div class="label">最高 / 最低</div><div class="value">${symbol.high} / ${symbol.low}</div></div>
          <div class="metric"><div class="label">今开</div><div class="value">${symbol.open}</div></div>
          <div class="metric"><div class="label">昨收</div><div class="value">${symbol.prevClose}</div></div>
        </div>
        <div class="reasons">${symbol.reasons.join(' · ') || '暂无显著特征'}</div>
      </div>
    `;
  }).join('');

  previousScores = new Map(data.symbols.map(s => [s.code, s.score]));
}

async function syncMarket() {
  const btn = document.getElementById('syncBtn');
  btn.disabled = true;
  btn.textContent = '同步中...';
  try {
    await fetch('/api/sync', { method: 'POST' });
    setLastSyncTime();
    await loadDashboard();
  } finally {
    btn.disabled = false;
    btn.textContent = '同步真实行情';
  }
}

function stopAutoSync() {
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  autoSyncTimer = null;
  autoSyncEnabled = false;
  document.getElementById('autoStatus').textContent = '关闭';
  document.getElementById('toggleAutoBtn').textContent = '开启自动同步';
}

function startAutoSync() {
  stopAutoSync();
  const interval = Number(document.getElementById('intervalSelect').value);
  autoSyncEnabled = true;
  document.getElementById('autoStatus').textContent = `运行中（${interval / 1000} 秒）`;
  document.getElementById('toggleAutoBtn').textContent = '关闭自动同步';
  autoSyncTimer = setInterval(syncMarket, interval);
}

document.getElementById('refreshBtn').addEventListener('click', loadDashboard);
document.getElementById('syncBtn').addEventListener('click', syncMarket);
document.getElementById('toggleAutoBtn').addEventListener('click', () => {
  if (autoSyncEnabled) stopAutoSync();
  else startAutoSync();
});
document.getElementById('intervalSelect').addEventListener('change', () => {
  if (autoSyncEnabled) startAutoSync();
});
document.getElementById('resetBtn').addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST' });
  previousScores.clear();
  await loadDashboard();
});

document.getElementById('updateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = {
    symbols: [{
      code: form.get('code'),
      price: Number(form.get('price')),
      open: Number(form.get('open')),
      high: Number(form.get('high')),
      low: Number(form.get('low')),
      prevClose: Number(form.get('prevClose')),
      timeline: String(form.get('timeline')).split(',').map(v => Number(v.trim()))
    }]
  };
  await fetch('/api/market', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  event.target.reset();
  await loadDashboard();
});

loadDashboard();
