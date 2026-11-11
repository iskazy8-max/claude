'use strict';

const STORE_KEY = 'habits-v1';
const PRAYERS = [
  ['fajr', 'Fajr', 'الفجر'],
  ['dhuhr', 'Dhuhr', 'الظهر'],
  ['asr', 'Asr', 'العصر'],
  ['maghrib', 'Maghrib', 'المغرب'],
  ['isha', 'Isha', 'العشاء']
];

// ---------- state ----------
let state = { days: {}, weights: {} };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY));
  if (saved && typeof saved === 'object') state = { days: saved.days || {}, weights: saved.weights || {} };
} catch (e) { /* start fresh */ }

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { alert('Could not save — storage is full or blocked.'); }
}

// ---------- dates ----------
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => keyOf(new Date());
const shift = (key, n) => { const d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); };
const fmt = (key, opts) => dateOf(key).toLocaleDateString(undefined, opts);

// ---------- day helpers ----------
const emptyDay = () => ({ prayers: {}, quran: false, gym: false, adhkar: { morning: {}, evening: {} } });
const peek = key => state.days[key] || emptyDay();
function day(key) {
  const d = state.days[key] || (state.days[key] = emptyDay());
  d.prayers = d.prayers || {};
  d.adhkar = d.adhkar || {};
  d.adhkar.morning = d.adhkar.morning || {};
  d.adhkar.evening = d.adhkar.evening || {};
  return d;
}

const adhkarList = period => ADHKAR.filter(a => a.when === 'both' || a.when === period);
function adhkarProgress(key, period) {
  const counts = (peek(key).adhkar || {})[period] || {};
  const list = adhkarList(period);
  const done = list.filter(a => (counts[a.id] || 0) >= a.count).length;
  return { done, total: list.length, complete: done === list.length };
}
const prayerCount = key => PRAYERS.filter(p => (peek(key).prayers || {})[p[0]]).length;

const HABITS = [
  { id: 'prayers', name: 'Prayers', level: k => prayerCount(k) / 5 },
  { id: 'morning', name: 'Morning adhkar', level: k => { const p = adhkarProgress(k, 'morning'); return p.done / p.total; } },
  { id: 'evening', name: 'Evening adhkar', level: k => { const p = adhkarProgress(k, 'evening'); return p.done / p.total; } },
  { id: 'quran', name: 'Quran · 2 pages', level: k => (peek(k).quran ? 1 : 0) },
  { id: 'gym', name: 'Gym', level: k => (peek(k).gym ? 1 : 0) }
];

// Consecutive completed days ending today (or yesterday if today isn't done yet).
function streak(habit) {
  let k = todayKey();
  if (habit.level(k) < 1) k = shift(k, -1);
  let n = 0;
  while (habit.level(k) >= 1) { n++; k = shift(k, -1); }
  return n;
}

// ---------- ui state ----------
let tab = 'today';
let cur = todayKey();
let period = new Date().getHours() < 15 ? 'morning' : 'evening';
let range = 30;
let theme = document.documentElement.dataset.theme || 'light';

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('habits-theme', theme); } catch (e) { /* not saved */ }
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0b1512' : '#f4f7f6';
}

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
const buzz = () => { if (navigator.vibrate) navigator.vibrate(8); };

function dateBar() {
  const isToday = cur === todayKey();
  return `<header class="datebar">
    <button data-act="prev" aria-label="Previous day">‹</button>
    <div><h1>${isToday ? 'Today' : fmt(cur, { weekday: 'long' })}</h1>
      <p>${fmt(cur, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <button data-act="next" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button>
  </header>`;
}

// ---------- views ----------
function renderToday() {
  const d = peek(cur);
  const pc = prayerCount(cur);
  const m = adhkarProgress(cur, 'morning');
  const e = adhkarProgress(cur, 'evening');
  const done = pc + (m.complete ? 1 : 0) + (e.complete ? 1 : 0) + (d.quran ? 1 : 0);
  const total = 8;
  const gymWeek = [0, 1, 2, 3, 4, 5, 6].filter(i => peek(shift(todayKey(), -i)).gym).length;

  return `${dateBar()}
  <section class="card summary">
    <div class="ring" style="--p:${Math.round(done / total * 100)}"><b>${done}/${total}</b></div>
    <div><h2>${done === total ? 'All done — ما شاء الله' : 'Daily progress'}</h2>
      <p>Prayers, adhkar and Quran${d.gym ? ' · gym done 💪' : ''}</p></div>
  </section>

  <h3>Prayers <small>${pc}/5</small></h3>
  <section class="card prayers">
    ${PRAYERS.map(([id, en, ar]) => `
      <button class="prayer ${d.prayers[id] ? 'on' : ''}" data-act="prayer" data-id="${id}" aria-pressed="${!!d.prayers[id]}">
        <i class="check"></i><span>${en}</span><em lang="ar">${ar}</em>
      </button>`).join('')}
  </section>

  <h3>Adhkar</h3>
  <section class="card rows">
    <button class="row ${m.complete ? 'on' : ''}" data-act="open-adhkar" data-id="morning">
      <i class="check"></i><span>Morning adhkar<small lang="ar">أذكار الصباح</small></span><b>${m.done}/${m.total} ›</b>
    </button>
    <button class="row ${e.complete ? 'on' : ''}" data-act="open-adhkar" data-id="evening">
      <i class="check"></i><span>Evening adhkar<small lang="ar">أذكار المساء</small></span><b>${e.done}/${e.total} ›</b>
    </button>
  </section>

  <h3>Habits</h3>
  <section class="card rows">
    <button class="row ${d.quran ? 'on' : ''}" data-act="toggle" data-id="quran" aria-pressed="${!!d.quran}">
      <i class="check"></i><span>Read 2 pages of Quran<small>🔥 ${streak(HABITS[3])} day streak</small></span>
    </button>
    <button class="row ${d.gym ? 'on' : ''}" data-act="toggle" data-id="gym" aria-pressed="${!!d.gym}">
      <i class="check"></i><span>Gym<small>${gymWeek} session${gymWeek === 1 ? '' : 's'} in the last 7 days</small></span>
    </button>
  </section>`;
}

function renderAdhkar() {
  const counts = (peek(cur).adhkar || {})[period] || {};
  const list = adhkarList(period);
  const p = adhkarProgress(cur, period);
  return `${dateBar()}
  <div class="seg">
    <button class="${period === 'morning' ? 'on' : ''}" data-act="period" data-id="morning">🌅 الصباح · Morning</button>
    <button class="${period === 'evening' ? 'on' : ''}" data-act="period" data-id="evening">🌙 المساء · Evening</button>
  </div>
  <div class="bar"><i style="width:${p.done / p.total * 100}%"></i></div>
  <p class="hint">${p.complete ? 'Completed ✓' : `${p.done} of ${p.total} done — tap a card to count`}
    <button class="link" data-act="reset-adhkar">Reset</button></p>
  ${list.map(a => {
    const c = Math.min(counts[a.id] || 0, a.count);
    const fin = c >= a.count;
    return `<button class="card dhikr ${fin ? 'on' : ''}" data-act="dhikr" data-id="${a.id}">
      ${a.title ? `<small>${a.title}</small>` : ''}
      <p lang="ar" dir="rtl">${period === 'evening' && a.evening ? a.evening : a.text}</p>
      <span class="count">${fin ? '✓ ' : ''}${c} / ${a.count}</span>
    </button>`;
  }).join('')}`;
}

function weightEntries() {
  return Object.keys(state.weights).sort().map(k => ({ k, w: state.weights[k] }));
}

function chart(entries) {
  if (entries.length < 2) return '<p class="empty">Log at least two days to see your chart.</p>';
  const W = 340, H = 170, L = 36, R = 10, T = 12, B = 24;
  const ws = entries.map(e => e.w);
  let lo = Math.min(...ws), hi = Math.max(...ws);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const padY = (hi - lo) * 0.1; lo -= padY; hi += padY;
  const t0 = dateOf(entries[0].k).getTime();
  const span = dateOf(entries[entries.length - 1].k).getTime() - t0 || 1;
  const x = e => L + (dateOf(e.k).getTime() - t0) / span * (W - L - R);
  const y = w => T + (hi - w) / (hi - lo) * (H - T - B);
  const pts = entries.map(e => `${x(e).toFixed(1)},${y(e.w).toFixed(1)}`);
  const ticks = [hi - padY, (hi + lo) / 2, lo + padY];
  const short = { day: 'numeric', month: 'short' };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
      <text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(1)}</text>`).join('')}
    <polygon class="area" points="${L},${H - B} ${pts.join(' ')} ${W - R},${H - B}"/>
    <polyline class="line" points="${pts.join(' ')}"/>
    ${entries.length <= 45 ? entries.map(e => `<circle cx="${x(e).toFixed(1)}" cy="${y(e.w).toFixed(1)}" r="2.6"/>`).join('') : ''}
    <text x="${L}" y="${H - 6}">${fmt(entries[0].k, short)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${fmt(entries[entries.length - 1].k, short)}</text>
  </svg>`;
}

function renderWeight() {
  const all = weightEntries();
  const from = range ? shift(todayKey(), -range + 1) : '';
  const shown = all.filter(e => e.k >= from);
  const last = all[all.length - 1];
  const prev = all[all.length - 2];
  const delta = (a, b) => {
    const d = a - b;
    return `<b class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d.toFixed(1)}</b>`;
  };
  const week = all.filter(e => e.k >= shift(todayKey(), -6));
  const avg = week.length ? week.reduce((s, e) => s + e.w, 0) / week.length : null;

  return `<header class="datebar plain"><div><h1>Weight</h1><p>One entry per day, in kg</p></div></header>
  <form class="card weigh" data-form="weight">
    <label>Date<input type="date" name="date" value="${todayKey()}" max="${todayKey()}" required></label>
    <label>Weight (kg)<input type="number" name="kg" inputmode="decimal" step="0.1" min="20" max="400"
      placeholder="${last ? last.w.toFixed(1) : '75.0'}" required></label>
    <button type="submit">Save</button>
  </form>

  <section class="stats">
    <div class="card"><small>Current</small><b>${last ? last.w.toFixed(1) : '—'}</b></div>
    <div class="card"><small>Since last</small>${prev ? delta(last.w, prev.w) : '<b>—</b>'}</div>
    <div class="card"><small>Since start</small>${prev ? delta(last.w, all[0].w) : '<b>—</b>'}</div>
    <div class="card"><small>7-day avg</small><b>${avg ? avg.toFixed(1) : '—'}</b></div>
  </section>

  <div class="seg small">
    ${[[30, '30 days'], [90, '90 days'], [0, 'All']].map(([n, l]) =>
      `<button class="${range === n ? 'on' : ''}" data-act="range" data-id="${n}">${l}</button>`).join('')}
  </div>
  <section class="card chart">${chart(shown)}</section>

  <h3>History</h3>
  <section class="card rows">
    ${all.length ? all.slice().reverse().map((e, i, arr) => {
      const before = arr[i + 1];
      return `<div class="row log"><span>${fmt(e.k, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
        ${before ? delta(e.w, before.w) : ''}
        <b>${e.w.toFixed(1)} kg</b>
        <button class="del" data-act="del-weight" data-id="${e.k}" aria-label="Delete entry">✕</button></div>`;
    }).join('') : '<p class="empty">No entries yet.</p>'}
  </section>`;
}

function renderProgress() {
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(shift(todayKey(), -i));
  return `<header class="datebar plain"><div><h1>Progress</h1><p>Last 30 days</p></div></header>
  ${HABITS.map(h => {
    const levels = days.map(h.level);
    const full = levels.filter(l => l >= 1).length;
    return `<section class="card habit">
      <div class="head"><h2>${h.name}</h2><span>🔥 ${streak(h)}</span><span>${full}/30</span></div>
      <div class="grid30">${levels.map((l, i) =>
        `<i title="${days[i]}" style="--l:${l}" class="${l >= 1 ? 'full' : l > 0 ? 'part' : ''}"></i>`).join('')}</div>
    </section>`;
  }).join('')}
  <h3>Appearance</h3>
  <div class="seg">
    ${[['light', '☀️ Light'], ['dark', '🌙 Dark'], ['auto', 'Auto']].map(([id, l]) =>
      `<button class="${theme === id ? 'on' : ''}" data-act="theme" data-id="${id}">${l}</button>`).join('')}
  </div>
  <h3>Backup</h3>
  <section class="card rows">
    <button class="row" data-act="export"><span>Export data<small>Download a JSON backup</small></span><b>›</b></button>
    <label class="row"><span>Import data<small>Restore from a backup file</small></span><b>›</b>
      <input type="file" accept="application/json,.json" data-act="import" hidden></label>
  </section>
  <p class="hint center">Everything is stored on this device only.</p>`;
}

const VIEWS = { today: renderToday, adhkar: renderAdhkar, weight: renderWeight, progress: renderProgress };

function render(keepScroll = true) {
  const y = window.scrollY;
  view.innerHTML = VIEWS[tab]();
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo(0, keepScroll ? y : 0);
}

// ---------- events ----------
tabs.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  tab = b.dataset.tab;
  render(false);
});

view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'prev': cur = shift(cur, -1); break;
    case 'next': if (cur < todayKey()) cur = shift(cur, 1); break;
    case 'prayer': { const d = day(cur); d.prayers[id] = !d.prayers[id]; buzz(); break; }
    case 'toggle': { const d = day(cur); d[id] = !d[id]; buzz(); break; }
    case 'open-adhkar': period = id; tab = 'adhkar'; render(false); return;
    case 'period': period = id; break;
    case 'dhikr': {
      const a = ADHKAR.find(x => x.id === id);
      const counts = day(cur).adhkar[period];
      if ((counts[id] || 0) >= a.count) return;
      counts[id] = (counts[id] || 0) + 1;
      buzz();
      break;
    }
    case 'reset-adhkar':
      if (!confirm(`Reset ${period} adhkar for this day?`)) return;
      day(cur).adhkar[period] = {};
      break;
    case 'range': range = Number(id); break;
    case 'theme': theme = id; applyTheme(); render(); return;
    case 'del-weight':
      if (!confirm('Delete this entry?')) return;
      delete state.weights[id];
      break;
    case 'export': exportData(); return;
    default: return;
  }
  save();
  render();
});

view.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'weight') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const date = f.get('date');
  const kg = Math.round(parseFloat(String(f.get('kg')).replace(',', '.')) * 10) / 10;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey() || !(kg >= 20 && kg <= 400)) return;
  state.weights[date] = kg;
  save();
  render();
});

view.addEventListener('change', e => {
  if (e.target.dataset.act !== 'import' || !e.target.files[0]) return;
  e.target.files[0].text().then(text => {
    const data = JSON.parse(text);
    if (!data || typeof data.days !== 'object' || typeof data.weights !== 'object') throw new Error('bad file');
    if (!confirm('Replace all current data with this backup?')) return;
    state = { days: data.days, weights: data.weights };
    save();
    render();
  }).catch(() => alert('That file is not a valid backup.'));
});

function exportData() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `habits-backup-${todayKey()}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Roll over to the new day when the app is reopened after midnight.
let lastSeen = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.hidden || lastSeen === todayKey()) return;
  if (cur === lastSeen) cur = todayKey();
  lastSeen = todayKey();
  render();
});

applyTheme();
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
