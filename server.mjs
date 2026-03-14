import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'market.json');

fs.mkdirSync(dataDir, { recursive: true });

const defaultData = {
  updatedAt: new Date().toISOString(),
  sectors: {
    '中字头': { changePct: 0 },
    '基建': { changePct: 0 },
    '电力设备': { changePct: 0 },
    '半导体': { changePct: 0 },
    '光伏': { changePct: 0 }
  },
  symbols: [
    { code: '601669', name: '中国电建', type: 'stock', market: 'SH', sectors: ['中字头', '基建', '电力设备'], price: 0, prevClose: 0, open: 0, high: 0, low: 0, watchNote: '中字头+电力基建', timeline: [0, 0, 0, 0, 0] },
    { code: '601179', name: '中国西电', type: 'stock', market: 'SH', sectors: ['中字头', '电力设备'], price: 0, prevClose: 0, open: 0, high: 0, low: 0, watchNote: '特高压/输变电', timeline: [0, 0, 0, 0, 0] },
    { code: '512480', name: '半导体ETF', type: 'etf', market: 'SH', sectors: ['半导体'], price: 0, prevClose: 0, open: 0, high: 0, low: 0, watchNote: '观察是否强于光伏', timeline: [0, 0, 0, 0, 0] },
    { code: '515790', name: '光伏ETF', type: 'etf', market: 'SH', sectors: ['光伏'], price: 0, prevClose: 0, open: 0, high: 0, low: 0, watchNote: '观察是否弱于半导体', timeline: [0, 0, 0, 0, 0] }
  ]
};

function ensureData() {
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2));
}
function loadData() {
  ensureData();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}
function saveData(data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function scoreSymbol(symbol, sectorsMap) {
  const safePrevClose = symbol.prevClose || 1;
  const changePct = ((symbol.price - safePrevClose) / safePrevClose) * 100;
  const openPct = ((symbol.open - safePrevClose) / safePrevClose) * 100;
  const intradayPos = symbol.high === symbol.low ? 0.5 : (symbol.price - symbol.low) / Math.max((symbol.high - symbol.low), 0.0001);
  const avgSector = (symbol.sectors || []).reduce((sum, name) => sum + (sectorsMap[name]?.changePct || 0), 0) / Math.max((symbol.sectors || []).length, 1);
  const timeline = Array.isArray(symbol.timeline) && symbol.timeline.length ? symbol.timeline : [symbol.price, symbol.price, symbol.price, symbol.price, symbol.price];
  const slope = timeline.at(-1) - timeline[0];
  const maxTimeline = Math.max(...timeline);
  const endDrawdown = maxTimeline ? (timeline.at(-1) - maxTimeline) / maxTimeline : 0;

  const changeScore = Math.max(0, Math.min(40, 16 + changePct * 4.5));
  const structureScore = Math.max(0, Math.min(30, intradayPos * 30));
  const sectorScore = Math.max(0, Math.min(20, 10 + avgSector * 4));
  const openScore = Math.max(0, Math.min(10, 5 + openPct));

  let total = changeScore + structureScore + sectorScore + openScore;
  if (endDrawdown < -0.015) total -= 12;
  if (changePct > 0 && slope < 0) total -= 8;
  if (openPct > 5 && changePct < openPct / 2) total -= 10;
  total = Math.max(0, Math.min(100, Math.round(total)));

  let trendLabel = '横盘整理';
  if (changePct > 2 && intradayPos > 0.7 && slope > 0) trendLabel = '强势上攻';
  else if (changePct > 0.5 && intradayPos > 0.55) trendLabel = '强势震荡';
  else if (changePct > -0.5 && endDrawdown < -0.015) trendLabel = '冲高回落';
  else if (changePct < -1 || intradayPos < 0.3) trendLabel = '走弱下行';

  const strengthLabel = total >= 75 ? '强' : total >= 55 ? '中' : '弱';
  const reasons = [];
  if (changePct > 1) reasons.push(`涨幅${changePct.toFixed(2)}%`);
  if (avgSector > 1) reasons.push(`板块均涨${avgSector.toFixed(2)}%`);
  if (openPct > 0.5) reasons.push(`高开${openPct.toFixed(2)}%`);
  if (intradayPos > 0.7) reasons.push('接近日内高位');
  if (trendLabel === '冲高回落') reasons.push('回落明显');
  if (trendLabel === '走弱下行') reasons.push('跌破日内关键区');

  return {
    ...symbol,
    changePct: Number(changePct.toFixed(2)),
    openPct: Number(openPct.toFixed(2)),
    avgSectorChangePct: Number(avgSector.toFixed(2)),
    score: total,
    strengthLabel,
    trendLabel,
    reasons
  };
}

function buildDashboard() {
  const data = loadData();
  const sectors = Object.entries(data.sectors).map(([name, value]) => ({ name, ...value })).sort((a, b) => b.changePct - a.changePct);
  const symbols = data.symbols.map(s => scoreSymbol(s, data.sectors)).sort((a, b) => b.score - a.score);
  const comparisons = [
    { title: '中国电建 vs 中国西电', left: symbols.find(s => s.code === '601669'), right: symbols.find(s => s.code === '601179') },
    { title: '半导体ETF vs 光伏ETF', left: symbols.find(s => s.code === '512480'), right: symbols.find(s => s.code === '515790') }
  ].map(item => {
    if (!item.left || !item.right) return { ...item, diff: 0, winner: '数据不足' };
    const diff = item.left.score - item.right.score;
    const winner = diff === 0 ? '持平' : diff > 0 ? item.left.name : item.right.name;
    return { ...item, diff, winner };
  });
  return { updatedAt: data.updatedAt, sectors, symbols, comparisons };
}

function nextTimeline(oldTimeline = [], price) {
  const safe = Number(price) || 0;
  const timeline = [...oldTimeline.filter(v => Number.isFinite(v)), safe].slice(-5);
  while (timeline.length < 5) timeline.unshift(safe);
  return timeline;
}

function recomputeSectors(data) {
  const buckets = {};
  for (const symbol of data.symbols) {
    const safePrevClose = symbol.prevClose || 1;
    const changePct = ((symbol.price - safePrevClose) / safePrevClose) * 100;
    for (const sector of symbol.sectors || []) {
      buckets[sector] ||= { totalChange: 0, count: 0 };
      buckets[sector].totalChange += changePct;
      buckets[sector].count += 1;
    }
  }
  for (const [sector, bucket] of Object.entries(buckets)) {
    data.sectors[sector] = { changePct: Number((bucket.totalChange / bucket.count).toFixed(2)) };
  }
}

function fetchAkshareQuotes(symbols) {
  return new Promise((resolve, reject) => {
    const py = spawn(path.join(__dirname, '.venv', 'bin', 'python'), [path.join(__dirname, 'fetch_akshare_quotes.py')], {
      cwd: __dirname,
      env: {
        ...process.env,
        http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '', all_proxy: '', ALL_PROXY: ''
      }
    });

    let stdout = '';
    let stderr = '';
    py.stdout.on('data', chunk => { stdout += chunk.toString(); });
    py.stderr.on('data', chunk => { stderr += chunk.toString(); });
    py.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || `AkShare exited with ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    py.stdin.write(JSON.stringify({ symbols }));
    py.stdin.end();
  });
}

async function syncRealMarketData() {
  const data = loadData();
  const result = await fetchAkshareQuotes(data.symbols);
  const parsedMap = new Map((result.quotes || []).filter(item => !item.error).map(item => [item.code, item]));

  data.symbols = data.symbols.map(symbol => {
    const parsed = parsedMap.get(symbol.code);
    if (!parsed) return symbol;
    const price = parsed.price || symbol.price;
    return {
      ...symbol,
      name: parsed.name || symbol.name,
      price,
      prevClose: parsed.prevClose || symbol.prevClose,
      open: parsed.open || symbol.open,
      high: parsed.high || symbol.high,
      low: parsed.low || symbol.low,
      turnover: parsed.turnover || symbol.turnover,
      timeline: nextTimeline(symbol.timeline, price)
    };
  });

  recomputeSectors(data);
  saveData(data);
  return buildDashboard();
}

function serveStatic(req, res) {
  const requested = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(publicDir, requested);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain; charset=utf-8' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/dashboard') return json(res, 200, buildDashboard());

  if (req.method === 'POST' && req.url === '/api/sync') {
    syncRealMarketData().then(dashboard => json(res, 200, { ok: true, dashboard })).catch(error => json(res, 500, { ok: false, error: error.message }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/market') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const data = loadData();
        if (payload.sectors) data.sectors = { ...data.sectors, ...payload.sectors };
        if (Array.isArray(payload.symbols)) {
          for (const incoming of payload.symbols) {
            const idx = data.symbols.findIndex(s => s.code === incoming.code);
            if (idx >= 0) data.symbols[idx] = { ...data.symbols[idx], ...incoming };
            else data.symbols.push(incoming);
          }
        }
        saveData(data);
        json(res, 200, { ok: true, updatedAt: data.updatedAt });
      } catch (error) {
        json(res, 400, { ok: false, error: error.message });
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/reset') {
    saveData(structuredClone(defaultData));
    return json(res, 200, { ok: true });
  }

  serveStatic(req, res);
});

const port = Number(process.env.PORT || 3088);
server.listen(port, () => console.log(`Stock MVP running at http://localhost:${port}`));
