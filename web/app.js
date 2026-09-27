// XRPL Risk Radar: renders data/*.json produced by pipeline/. Colors come only from theme.css tokens.
const $ = s => document.querySelector(s);
const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0'); // chart tokens are 6-digit hex
const last = a => a[a.length - 1];
const ago = (a, n) => a[Math.max(0, a.length - 1 - n)];

const HEAT_KEYS = ['fl_volume', 'fl_trades', 'amm_create', 'unique_traders', 'turnover', 'retail'];
const VERDICT_TOKEN = { risk_on: '--pos', risk_on_late: '--hot', neutral_early: '--warn', neutral: '--muted', risk_off: '--neg' };

let D = {}, T = {}, lang = 'en', charts = [];
const t = (k, vars = {}) => (T[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const getJSON = p => fetch(p).then(r => { if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); });

// formatting
const nf = (x, d = 0) => x.toLocaleString(lang, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPrice = (sym, x) => sym.endsWith('BTC') ? `${nf(Math.round(x * 1e8))} sats` : x >= 1000 ? `$${nf(x)}` : `$${nf(x, 4)}`;
const fmtBig = n => n >= 1e6 ? `${nf(n / 1e6, 1)}M` : n >= 1e3 ? `${nf(n / 1e3)}k` : nf(n);
const zoneOf = s => s > 85 ? 'euphoria' : s > 70 ? 'hot' : s >= 40 ? 'mild' : 'cold';
const scoreVar = s => s >= 60 ? 'var(--pos)' : s < 40 ? 'var(--neg)' : 'var(--warn)';
const shortDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString(lang, { month: 'short', year: '2-digit', timeZone: 'UTC' });
const signed =(x, d = 0) => `${x >= 0 ? '+' : ''}${nf(x, d)}`;

// charts
function mk(canvas, cfg) { const c = new Chart(canvas, cfg); charts.push(c); return c; }
function lazyChart(details, draw) {
  details.addEventListener('toggle', () => { if (details.open && !details.dataset.drawn) { details.dataset.drawn = '1'; draw(); } });
}
function opts({ x = {}, y = {}, legend = false, annotations = {} } = {}) {
  const ticks = { color: tok('--muted'), font: { size: 11 } };
  return {
    responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
    scales: {
      x: { ticks: { ...ticks, maxTicksLimit: 6, maxRotation: 0, callback(v) { return shortDate(this.getLabelForValue(v)); } }, grid: { display: false }, ...x },
      y: { grid: { color: tok('--line') }, ...y, ticks: { ...ticks, ...y.ticks } },
    },
    plugins: { legend: { display: legend, labels: { color: tok('--text'), boxWidth: 12, boxHeight: 2 } }, annotation: { annotations } },
  };
}
const line = (label, data, color, extra = {}) => ({ type: 'line', label, data, borderColor: color, backgroundColor: color, borderWidth: 1.5, pointRadius: 0, tension: 0.15, ...extra });
const hline = y => ({ type: 'line', yMin: y, yMax: y, borderColor: tok('--muted'), borderWidth: 1, borderDash: [4, 4] });
const band = (a, b, token) => ({ type: 'box', yMin: a, yMax: b, backgroundColor: alpha(tok(token), 0.12), borderWidth: 0 });

// sections
function renderVerdict() {
  const days = D.verdict.days, v = last(days);
  const pairs = Object.values(D.macro.pairs).map(p => ({ label: p.label, score: last(p.days).score }));
  const weakest = pairs.reduce((a, b) => (b.score < a.score ? b : a));
  const el = $('#verdict');
  el.style.setProperty('--v', `var(${VERDICT_TOKEN[v.v]})`);
  el.innerHTML = `
    <div class="label">${t('verdict.' + v.v)}</div>
    <p class="why">${t('why.' + v.v)}</p>
    <div class="subs">
      <div class="sub"><b style="color:${scoreVar(v.macro)}">${Math.round(v.macro)}</b><span>${t('verdict.macro')}</span></div>
      <div class="sub"><b style="color:var(--${zoneOf(v.heat)})">${Math.round(v.heat)}</b><span>${t('verdict.heat')} · ${t('heat.' + zoneOf(v.heat))}</span></div>
      <div class="sub"><b style="color:${scoreVar(weakest.score)}">${weakest.score}</b><span>${t('verdict.weakest', { pair: weakest.label })}</span></div>
    </div>
    <details><summary>${t('verdict.history')}</summary>
      <p class="note">${t('verdict.history_note')}</p>
      <div class="legend">${Object.keys(VERDICT_TOKEN).map(k => `<span style="--c:var(${VERDICT_TOKEN[k]})">${t('verdict.' + k)}</span>`).join('')}</div>
      <div class="chart"><canvas></canvas></div>
    </details>`;
  lazyChart(el.querySelector('details'), () => {
    const xrp = Object.fromEntries(D.macro.pairs.XRPUSDT.days.map(d => [d.d, d.c]));
    const ds = days.filter(d => xrp[d.d]);
    const col = Object.fromEntries(Object.entries(VERDICT_TOKEN).map(([k, v]) => [k, tok(v)]));
    mk(el.querySelector('canvas'), {
      type: 'line',
      data: { labels: ds.map(d => d.d), datasets: [line('XRP/USD', ds.map(d => xrp[d.d]), tok('--text'), { borderWidth: 2.5, segment: { borderColor: c => col[ds[c.p1DataIndex].v] } })] },
      options: opts({ y: { ticks: { callback: v => `$${nf(v, 2)}` } } }),
    });
  });
}

function renderPairs() {
  const box = $('#pairs');
  box.innerHTML = '';
  for (const [sym, p] of Object.entries(D.macro.pairs)) {
    const d = last(p.days), chg = (d.c / ago(p.days, 1).c - 1) * 100;
    const rsiKey = d.rsi > 80 ? 'overbought' : d.rsi < 40 ? 'weak' : d.rsi >= 50 && d.rsi <= 70 ? 'healthy' : 'neutral';
    const items = Object.entries(p.checks).filter(([k]) => !k.startsWith('rsi'))
      .map(([k, ok]) => `<li class="${ok ? 'ok' : ''}">${t('checks.' + k)}</li>`).join('')
      + `<li class="${rsiKey === 'healthy' ? 'ok' : ''}">${t('checks.rsi', { rsi: nf(d.rsi) })} · ${t('checks.rsi_' + rsiKey)}</li>`;
    const card = document.createElement('div');
    card.className = 'card pair';
    card.innerHTML = `
      <div class="head"><h3>${p.label}</h3><span class="price">${fmtPrice(sym, d.c)}</span></div>
      <div class="row">
        <div class="score"><b style="color:${scoreVar(d.score)}">${d.score}</b><span>/100 ${t('pair.score')}</span></div>
        <span class="num ${chg >= 0 ? 'chg-pos' : 'chg-neg'}">${signed(chg, 2)}% ${t('pair.day')}</span>
      </div>
      <ul class="checks">${items}</ul>
      <details><summary>${t('pair.show_chart')}</summary>
        <div class="chart"><canvas></canvas></div><div class="chart sm"><canvas></canvas></div><div class="chart sm"><canvas></canvas></div>
      </details>`;
    box.append(card);
    lazyChart(card.querySelector('details'), () => drawPair(card, sym, p));
  }
}

function drawPair(card, sym, p) {
  const days = p.days.slice(-365), labels = days.map(d => d.d);
  const [price, rsi, macd] = card.querySelectorAll('canvas');
  mk(price, {
    type: 'line',
    data: { labels, datasets: [
      line(t('chart.price'), days.map(d => d.c), tok('--text'), { borderWidth: 2 }),
      line('EMA 21', days.map(d => d.ema21), tok('--series-2')),
      line('SMA 50', days.map(d => d.sma50), tok('--series-5')),
      line('SMA 200', days.map(d => d.sma200), tok('--series-4'), { borderDash: [5, 4] }),
    ] },
    options: opts({ legend: true, y: { ticks: { callback: v => fmtPrice(sym, v) } } }),
  });
  mk(rsi, {
    type: 'line',
    data: { labels, datasets: [line('RSI 14', days.map(d => d.rsi), tok('--series-1'))] },
    options: opts({ x: { display: false }, y: { min: 0, max: 100, ticks: { stepSize: 30 } }, annotations: { hi: hline(70), lo: hline(30) } }),
  });
  mk(macd, {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'bar', label: 'Histogram', data: days.map(d => d.hist), backgroundColor: days.map(d => (d.hist >= 0 ? tok('--pos') : tok('--neg'))) },
      line('MACD', days.map(d => d.macd), tok('--series-2')),
      line('Signal', days.map(d => d.signal), tok('--series-5')),
    ] },
    options: opts({ x: { display: false }, y: { ticks: { display: false } } }),
  });
}

function renderHeat() {
  const days = D.heat.days, h = last(days), z = zoneOf(h.score);
  const el = $('#heat');
  el.innerHTML = `
    <div class="heat">
      <div><div class="big" style="color:var(--${z})">${Math.round(h.score)}</div><div class="zone" style="color:var(--${z})">${t('heat.' + z)}</div></div>
      <div>
        <div class="meter"><i style="left:${h.score}%"></i></div>
        <div class="scale num">${[0, 40, 70, 85, 100].map(n => `<span style="left:${n}%">${n}</span>`).join('')}</div>
        <div class="note num">${t('heat.vs', { a: Math.round(ago(days, 7).score), b: Math.round(ago(days, 30).score) })}</div>
      </div>
    </div>
    <p class="note">${t('heat.note')}</p>
    <details><summary>${t('heat.show_chart')}</summary><div class="chart"><canvas></canvas></div></details>`;
  lazyChart(el.querySelector('details'), () => mk(el.querySelector('canvas'), {
    type: 'line',
    data: { labels: days.map(d => d.d), datasets: [line('Meme heat', days.map(d => d.score), tok('--text'))] },
    options: opts({ y: { min: 0, max: 100 }, annotations: { a: band(0, 40, '--cold'), b: band(40, 70, '--mild'), c: band(70, 85, '--hot'), d: band(85, 100, '--euphoria') } }),
  }));
}

function renderDrivers() {
  const days = D.heat.days, h = last(days), w = ago(days, 7);
  const el = $('#drivers');
  el.innerHTML = '';
  delete el.dataset.drawn;
  for (const k of HEAT_KEYS) {
    const v = h.comp[k], dv = v - w.comp[k], z = zoneOf(v);
    const card = document.createElement('div');
    card.className = 'card driver';
    card.dataset.key = k;
    card.innerHTML = `
      <h3>${t('drivers.' + k)}</h3>
      <div class="val"><b style="color:var(--${z})">${Math.round(v)}</b><span class="num ${dv >= 0 ? 'chg-pos' : 'chg-neg'}">${t('drivers.vs7', { d: signed(dv) })}</span></div>
      <div class="bar"><i style="width:${v}%;background:var(--${z})"></i></div>
      <div class="mini"><canvas></canvas></div>`;
    el.append(card);
  }
  if (el.dataset.mode === 'chart') drawMinis();
}

function drawMinis() {
  const el = $('#drivers');
  if (el.dataset.drawn) return;
  el.dataset.drawn = '1';
  const days = D.heat.days, labels = days.map(d => d.d);
  el.querySelectorAll('.driver').forEach(card => {
    const k = card.dataset.key;
    mk(card.querySelector('canvas'), {
      type: 'line',
      data: { labels, datasets: [line(t('drivers.' + k), days.map(d => d.comp[k]), tok('--series-1'), { borderWidth: 1 })] },
      options: opts({ x: { display: false }, y: { min: 0, max: 100, ticks: { stepSize: 50 } } }),
    });
  });
}

const TABS = ['overview', 'macro', 'meme'];
function setTab(tab, push = true) {
  if (!TABS.includes(tab)) tab = TABS[0];
  document.querySelectorAll('.tabpanel').forEach(p => (p.hidden = p.dataset.tab !== tab));
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  store.set('tab', tab);
  if (push && location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
}

function setMode(m) {
  $('#drivers').dataset.mode = m;
  document.querySelectorAll('#mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  if (m === 'chart') drawMinis();
}

function renderPlatforms() {
  const el = $('#platforms');
  el.innerHTML = `<p class="note">${t('platforms.note')}</p><details><summary>${t('platforms.show')}</summary><div class="chart"><canvas></canvas></div></details>`;
  lazyChart(el.querySelector('details'), () => {
    const days = D.heat.days, tot = {};
    days.forEach(d => Object.entries(d.plat).forEach(([p, v]) => (tot[p] = (tot[p] || 0) + v)));
    const top = Object.keys(tot).sort((a, b) => tot[b] - tot[a]).slice(0, 6);
    const sma7 = a => a.map((_, i) => { const s = a.slice(Math.max(0, i - 6), i + 1); return s.reduce((x, y) => x + y, 0) / s.length; });
    mk(el.querySelector('canvas'), {
      type: 'line',
      data: { labels: days.map(d => d.d), datasets: top.map((p, i) => line(p, sma7(days.map(d => d.plat[p] || 0)).map(v => v || null), tok(`--series-${i + 1}`))) },
      options: opts({ legend: true, y: { type: 'logarithmic', ticks: { callback: v => (Number.isInteger(Math.log10(v)) ? fmtBig(v) : '') } } }),
    });
  });
}

function render() {
  charts.forEach(c => c.destroy());
  charts = [];
  document.querySelectorAll('[data-i18n]').forEach(e => (e.textContent = t(e.dataset.i18n)));
  $('#asof').textContent = t('asof', { date: last(D.verdict.days).d });
  renderVerdict();
  renderPairs();
  renderHeat();
  renderDrivers();
  renderPlatforms();
}

async function setLang(l) {
  T = await getJSON(`locales/${l}.json`);
  lang = l;
  store.set('lang', l);
  document.documentElement.lang = l;
  document.querySelectorAll('#lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l));
  render();
}

async function init() {
  [D.heat, D.macro, D.verdict] = await Promise.all(['data/heat.json', 'data/macro.json', 'data/verdict.json'].map(getJSON));
  document.querySelectorAll('#lang button').forEach(b => (b.onclick = () => setLang(b.dataset.lang)));
  document.querySelectorAll('#mode button').forEach(b => (b.onclick = () => setMode(b.dataset.mode)));
  document.querySelectorAll('#tabs button').forEach(b => (b.onclick = () => setTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1), false));
  setMode('value');
  setTab(location.hash.slice(1) || store.get('tab') || TABS[0], false);
  await setLang(store.get('lang') === 'es' ? 'es' : 'en');
}

init().catch(e => { $('#verdict').textContent = `Could not load data: ${e.message}`; });
