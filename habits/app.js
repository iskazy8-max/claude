'use strict';

const STORE_KEY = 'habits-v1';
const PRAYERS = [
  ['fajr', 'Fajr', 'الفجر'],
  ['dhuhr', 'Dhuhr', 'الظهر'],
  ['asr', 'Asr', 'العصر'],
  ['maghrib', 'Maghrib', 'المغرب'],
  ['isha', 'Isha', 'العشاء']
];
// Tapping a prayer cycles through these, then back to not prayed.
const STATUS = { ontime: 'On time', jamaah: 'Jama’ah', late: 'Late' };
const STATUS_NEXT = { '': 'ontime', ontime: 'jamaah', jamaah: 'late', late: '' };
const EXTRAS = [['rawatib', 'Sunnah'], ['duha', 'Duha'], ['witr', 'Witr'], ['qiyam', 'Qiyam']];
const GYM_PARTS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Full body'];
const DEFAULT_HABITS = [
  { id: 'quran', name: 'Read 2 pages of Quran', daily: true },
  { id: 'gym', name: 'Gym', daily: false }
];
const ADHKAR_SETS = [
  ['morning', '🌅 Morning'], ['evening', '🌙 Evening'], ['prayer', '🕌 After prayer'], ['sleep', '😴 Sleep'], ['tasbih', '📿 Tasbih']
];

// ---------- state ----------
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

// Accepts saved data or a backup from any earlier version and fills in what is missing.
function normalize(raw) {
  const s = obj(raw);
  const out = {
    days: obj(s.days),
    weights: obj(s.weights),
    habits: Array.isArray(s.habits)
      ? s.habits.filter(h => h && typeof h.id === 'string' && typeof h.name === 'string')
        .map(h => ({ id: h.id, name: h.name.slice(0, 40), daily: h.daily !== false }))
      : DEFAULT_HABITS.map(h => ({ ...h })),
    settings: { lat: null, lng: null, method: 'MWL', asr: 1, remind: false, ...obj(s.settings) },
    goal: num(s.goal),
    height: num(s.height),
    tasbih: { count: 0, target: 33, ...obj(s.tasbih) }
  };
  for (const k in out.days) {
    const d = out.days[k] = obj(out.days[k]);
    d.prayers = obj(d.prayers);
    d.extra = obj(d.extra);
    d.adhkar = obj(d.adhkar);
    d.h = obj(d.h);
    if (d.quran) d.h.quran = true;
    if (d.gym) d.h.gym = true;
    delete d.quran;
    delete d.gym;
  }
  return out;
}

let state;
try { state = normalize(JSON.parse(localStorage.getItem(STORE_KEY))); }
catch (e) { state = normalize(null); }

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { alert('Could not save — storage is full or blocked.'); }
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- dates ----------
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => keyOf(new Date());
const shift = (key, n) => { const d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); };
const fmt = (key, opts) => dateOf(key).toLocaleDateString(undefined, opts);
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const lastDays = n => Array.from({ length: n }, (_, i) => shift(todayKey(), i - n + 1));

// ---------- day helpers ----------
const emptyDay = () => ({ prayers: {}, extra: {}, adhkar: {}, h: {} });
const peek = key => state.days[key] || emptyDay();
const day = key => state.days[key] || (state.days[key] = emptyDay());

const prayerStatus = (key, id) => { const v = peek(key).prayers[id]; return v === true ? 'ontime' : (STATUS[v] ? v : ''); };
const prayerCount = key => PRAYERS.filter(p => prayerStatus(key, p[0])).length;

function adhkarList(set) {
  if (set === 'prayer') return ADHKAR_PRAYER;
  if (set === 'sleep') return ADHKAR_SLEEP;
  return ADHKAR.filter(a => a.when === 'both' || a.when === set);
}
function adhkarProgress(key, set) {
  const counts = peek(key).adhkar[set] || {};
  const list = adhkarList(set);
  const done = list.filter(a => (counts[a.id] || 0) >= a.count).length;
  return { done, total: list.length, complete: done === list.length };
}

// Everything shown on the Progress tab. level() is 0..1 for a given day.
function trackers() {
  return [
    { id: 'prayers', name: 'Prayers', daily: true, level: k => prayerCount(k) / 5 },
    { id: 'morning', name: 'Morning adhkar', daily: true, level: k => { const p = adhkarProgress(k, 'morning'); return p.done / p.total; } },
    { id: 'evening', name: 'Evening adhkar', daily: true, level: k => { const p = adhkarProgress(k, 'evening'); return p.done / p.total; } },
    ...state.habits.map(h => ({ ...h, level: k => (peek(k).h[h.id] ? 1 : 0) }))
  ];
}

// Consecutive completed days ending today (or yesterday if today isn't done yet).
function streak(level) {
  let k = todayKey();
  if (level(k) < 1) k = shift(k, -1);
  let n = 0;
  while (level(k) >= 1) { n++; k = shift(k, -1); }
  return n;
}
const habitNote = h => {
  const level = k => (peek(k).h[h.id] ? 1 : 0);
  if (h.daily) return `🔥 ${streak(level)} day streak`;
  const n = lastDays(7).filter(level).length;
  return `${n} time${n === 1 ? '' : 's'} in the last 7 days`;
};

// ---------- prayer times ----------
const hasLocation = () => typeof state.settings.lat === 'number' && typeof state.settings.lng === 'number';
function timesFor(key) {
  if (!hasLocation()) return null;
  const s = state.settings;
  return prayerTimes(key, s.lat, s.lng, s.method, s.asr === 2 ? 2 : 1);
}
function nextPrayer() {
  const now = Date.now();
  for (const key of [todayKey(), shift(todayKey(), 1)]) {
    const t = timesFor(key);
    if (!t) return null;
    for (const [id, en] of PRAYERS) if (t[id].getTime() > now) return { en, at: t[id] };
  }
  return null;
}
function nextPrayerText() {
  const n = nextPrayer();
  if (!n) return '';
  const mins = Math.max(1, Math.round((n.at - Date.now()) / 60000));
  const left = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  return `<small>Next prayer</small><b>${n.en} · ${hhmm(n.at)}</b><span>in ${left}</span>`;
}

// ---------- reminders (fire while the app is open or recently in the background) ----------
let timers = [];
const canNotify = () => 'Notification' in window && Notification.permission === 'granted';
function notify(title, body) {
  const opts = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: title };
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(r => r.showNotification(title, opts)).catch(() => {});
  } else {
    try { new Notification(title, opts); } catch (e) { /* not supported here */ }
  }
}
function scheduleReminders() {
  timers.forEach(clearTimeout);
  timers = [];
  if (!state.settings.remind || !canNotify()) return;
  const t = timesFor(todayKey());
  if (!t) return;
  const events = PRAYERS.map(([id, en, ar]) => ({ at: t[id], title: `${en} · ${ar}`, body: `It is time for ${en} (${hhmm(t[id])}).` }));
  events.push({ at: new Date(t.fajr.getTime() + 30 * 60000), title: 'Morning adhkar · أذكار الصباح', body: 'Time for your morning adhkar.' });
  events.push({ at: new Date(t.asr.getTime() + 30 * 60000), title: 'Evening adhkar · أذكار المساء', body: 'Time for your evening adhkar.' });
  const now = Date.now();
  events.filter(e => e.at.getTime() > now).forEach(e => {
    timers.push(setTimeout(() => notify(e.title, e.body), e.at.getTime() - now));
  });
}

// ---------- ui state ----------
let tab = 'today';
let cur = todayKey();
let period = new Date().getHours() < 15 ? 'morning' : 'evening';
let range = 30;
let span = 7;
let editing = false;
let theme = document.documentElement.dataset.theme || 'light';

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('habits-theme', theme); } catch (e) { /* not saved */ }
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0b1512' : '#f4f7f6';
}

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
const buzz = (ms = 8) => { if (navigator.vibrate) navigator.vibrate(ms); };

function dateBar() {
  const isToday = cur === todayKey();
  return `<header class="datebar">
    <button data-act="prev" aria-label="Previous day">‹</button>
    <div><h1>${isToday ? 'Today' : fmt(cur, { weekday: 'long' })}</h1>
      <p>${fmt(cur, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <button data-act="next" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button>
  </header>`;
}
const title = (h, sub) => `<header class="datebar plain"><div><h1>${h}</h1><p>${sub}</p></div></header>`;

// ---------- Today ----------
function habitRows(d) {
  if (editing) {
    return `${state.habits.map(h => `
      <div class="row edit">
        <input type="text" value="${esc(h.name)}" maxlength="40" data-act="rename" data-id="${esc(h.id)}" aria-label="Habit name">
        <label><input type="checkbox" data-act="daily" data-id="${esc(h.id)}" ${h.daily ? 'checked' : ''}> Daily</label>
        <button class="del" data-act="del-habit" data-id="${esc(h.id)}" aria-label="Delete habit">✕</button>
      </div>`).join('')}
      <form class="row edit" data-form="habit">
        <input type="text" name="name" maxlength="40" placeholder="New habit, e.g. Drink 2 L water" required>
        <label><input type="checkbox" name="daily" checked> Daily</label>
        <button type="submit" class="add">Add</button>
      </form>`;
  }
  if (!state.habits.length) return '<p class="empty">No habits yet — tap Edit to add one.</p>';
  return state.habits.map(h => {
    const on = !!d.h[h.id];
    let extra = '';
    if (h.id === 'gym' && on) {
      const log = obj(d.gymLog);
      const parts = Array.isArray(log.parts) ? log.parts : [];
      extra = `<div class="gymlog">
        <div class="chips">${GYM_PARTS.map(p =>
          `<button class="${parts.includes(p) ? 'on' : ''}" data-act="gym-part" data-id="${p}">${p}</button>`).join('')}</div>
        <label>Minutes <input type="number" inputmode="numeric" min="0" max="600" value="${log.min || ''}" placeholder="60" data-act="gym-min"></label>
      </div>`;
    }
    return `<button class="row ${on ? 'on' : ''}" data-act="habit" data-id="${esc(h.id)}" aria-pressed="${on}">
      <i class="check"></i><span>${esc(h.name)}<small>${habitNote(h)}</small></span>
    </button>${extra}`;
  }).join('');
}

function renderToday() {
  const d = peek(cur);
  const isToday = cur === todayKey();
  const pc = prayerCount(cur);
  const m = adhkarProgress(cur, 'morning');
  const e = adhkarProgress(cur, 'evening');
  const daily = state.habits.filter(h => h.daily);
  const done = pc + (m.complete ? 1 : 0) + (e.complete ? 1 : 0) + daily.filter(h => d.h[h.id]).length;
  const total = 7 + daily.length;
  const t = timesFor(cur);

  let timesCard = '';
  if (isToday && t) timesCard = `<section class="card next"><div id="next">${nextPrayerText()}</div><em>Sunrise ${hhmm(t.sunrise)}</em></section>`;
  else if (isToday && !hasLocation()) timesCard = `<button class="card next link-card" data-act="go" data-id="settings">📍 Set your location to see prayer times ›</button>`;

  return `${dateBar()}
  ${timesCard}
  <section class="card summary">
    <div class="ring" style="--p:${Math.round(done / total * 100)}"><b>${done}/${total}</b></div>
    <div><h2>${done === total ? 'All done — ما شاء الله' : 'Daily progress'}</h2>
      <p>Prayers, adhkar and daily habits</p></div>
  </section>

  <h3>Prayers <small>${pc}/5</small></h3>
  <section class="card prayers">
    ${PRAYERS.map(([id, en, ar]) => {
      const st = prayerStatus(cur, id);
      return `<button class="prayer ${st ? 'on ' + st : ''}" data-act="prayer" data-id="${id}">
        <i class="check"></i><span>${en}</span>
        ${t ? `<em>${hhmm(t[id])}</em>` : `<em lang="ar">${ar}</em>`}
        <small>${st ? STATUS[st] : '&nbsp;'}</small>
      </button>`;
    }).join('')}
  </section>
  <p class="hint">Tap again to change: on time → jama’ah → late → clear</p>
  <div class="chips">
    ${EXTRAS.map(([id, name]) => `<button class="${d.extra[id] ? 'on' : ''}" data-act="extra" data-id="${id}">${d.extra[id] ? '✓ ' : ''}${name}</button>`).join('')}
  </div>

  <h3>Adhkar</h3>
  <section class="card rows">
    <button class="row ${m.complete ? 'on' : ''}" data-act="open-adhkar" data-id="morning">
      <i class="check"></i><span>Morning adhkar<small lang="ar">أذكار الصباح</small></span><b>${m.done}/${m.total} ›</b>
    </button>
    <button class="row ${e.complete ? 'on' : ''}" data-act="open-adhkar" data-id="evening">
      <i class="check"></i><span>Evening adhkar<small lang="ar">أذكار المساء</small></span><b>${e.done}/${e.total} ›</b>
    </button>
    <button class="row" data-act="open-adhkar" data-id="prayer">
      <span>After prayer, sleep and tasbih<small>More adhkar and a free counter</small></span><b>›</b>
    </button>
  </section>

  <h3>Habits <button class="link" data-act="edit-habits">${editing ? 'Done' : 'Edit'}</button></h3>
  <section class="card rows">${habitRows(d)}</section>`;
}

// ---------- Adhkar ----------
function renderTasbih() {
  const { count, target } = state.tasbih;
  return `<section class="card tasbih">
    <div class="seg small">
      ${[[33, '33'], [99, '99'], [100, '100'], [0, '∞']].map(([n, l]) =>
        `<button class="${target === n ? 'on' : ''}" data-act="tasbih-target" data-id="${n}">${l}</button>`).join('')}
    </div>
    <button class="tap ${target && count >= target ? 'full' : ''}" data-act="tasbih" aria-label="Count">
      <b>${count}</b><small>${target ? `of ${target}` : 'tap to count'}</small>
    </button>
    <button class="link" data-act="tasbih-reset">Reset</button>
  </section>`;
}

function renderAdhkar() {
  const chips = `<div class="chips scroll">
    ${ADHKAR_SETS.map(([id, name]) => `<button class="${period === id ? 'on' : ''}" data-act="period" data-id="${id}">${name}</button>`).join('')}
  </div>`;
  if (period === 'tasbih') return `${title('Tasbih', 'Free counter')}${chips}${renderTasbih()}`;

  const counts = peek(cur).adhkar[period] || {};
  const list = adhkarList(period);
  const p = adhkarProgress(cur, period);
  const hint = p.complete ? 'Completed ✓'
    : `${p.done} of ${p.total} done — tap a card to count${period === 'prayer' ? '; reset after each prayer' : ''}`;
  return `${dateBar()}${chips}
  <div class="bar"><i style="width:${p.done / p.total * 100}%"></i></div>
  <p class="hint">${hint} <button class="link" data-act="reset-adhkar">Reset</button></p>
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

// ---------- Weight ----------
const weightEntries = () => Object.keys(state.weights).sort().map(k => ({ k, w: state.weights[k] }));
const delta = (a, b) => {
  const d = Math.round((a - b) * 10) / 10;
  return `<b class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d.toFixed(1)}</b>`;
};

function chart(entries) {
  if (entries.length < 2) return '<p class="empty">Log at least two days to see your chart.</p>';
  const W = 340, H = 170, L = 36, R = 10, T = 12, B = 24;
  const ws = entries.map(e => e.w).concat(state.goal ? [state.goal] : []);
  let lo = Math.min(...ws), hi = Math.max(...ws);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const padY = (hi - lo) * 0.1; lo -= padY; hi += padY;
  const t0 = dateOf(entries[0].k).getTime();
  const width = dateOf(entries[entries.length - 1].k).getTime() - t0 || 1;
  const x = e => L + (dateOf(e.k).getTime() - t0) / width * (W - L - R);
  const y = w => T + (hi - w) / (hi - lo) * (H - T - B);
  const pts = entries.map(e => `${x(e).toFixed(1)},${y(e.w).toFixed(1)}`);
  const ticks = [hi - padY, (hi + lo) / 2, lo + padY];
  const short = { day: 'numeric', month: 'short' };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
      <text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(1)}</text>`).join('')}
    <polygon class="area" points="${L},${H - B} ${pts.join(' ')} ${W - R},${H - B}"/>
    ${state.goal ? `<line x1="${L}" x2="${W - R}" y1="${y(state.goal)}" y2="${y(state.goal)}" class="goal"/>
      <text x="${W - R}" y="${y(state.goal) - 4}" text-anchor="end" class="goal-label">Goal ${state.goal.toFixed(1)}</text>` : ''}
    <polyline class="line" points="${pts.join(' ')}"/>
    ${entries.length <= 45 ? entries.map(e => `<circle cx="${x(e).toFixed(1)}" cy="${y(e.w).toFixed(1)}" r="2.6"/>`).join('') : ''}
    <text x="${L}" y="${H - 6}">${fmt(entries[0].k, short)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end">${fmt(entries[entries.length - 1].k, short)}</text>
  </svg>`;
}

function renderWeight() {
  const all = weightEntries();
  const from = range ? shift(todayKey(), -range + 1) : '';
  const last = all[all.length - 1];
  const prev = all[all.length - 2];
  const week = all.filter(e => e.k >= shift(todayKey(), -6));
  const avg = week.length ? week.reduce((s, e) => s + e.w, 0) / week.length : null;
  let toGoal = '<b>—</b>';
  if (last && state.goal) {
    const left = Math.round(Math.abs(last.w - state.goal) * 10) / 10;
    // Reached when the latest weight is at the goal, or has crossed it from the starting side.
    const reached = left === 0 || (all[0].w - state.goal) * (last.w - state.goal) < 0;
    toGoal = reached ? '<b class="down">Reached ✓</b>' : `<b>${left.toFixed(1)} kg</b>`;
  }
  const bmi = last && state.height ? last.w / Math.pow(state.height / 100, 2) : null;

  return `${title('Weight', 'One entry per day, in kg')}
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
    <div class="card"><small>To goal</small>${toGoal}</div>
    <div class="card"><small>BMI</small><b>${bmi ? bmi.toFixed(1) : '—'}</b></div>
  </section>

  <div class="seg small">
    ${[[30, '30 days'], [90, '90 days'], [0, 'All']].map(([n, l]) =>
      `<button class="${range === n ? 'on' : ''}" data-act="range" data-id="${n}">${l}</button>`).join('')}
  </div>
  <section class="card chart">${chart(all.filter(e => e.k >= from))}</section>

  <h3>Goal</h3>
  <form class="card weigh" data-form="goal">
    <label>Target weight (kg)<input type="number" name="goal" inputmode="decimal" step="0.1" min="20" max="400" value="${state.goal || ''}" placeholder="—"></label>
    <label>Height (cm, for BMI)<input type="number" name="height" inputmode="numeric" step="1" min="80" max="250" value="${state.height || ''}" placeholder="—"></label>
    <button type="submit">Save goal</button>
  </form>

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

// ---------- Progress ----------
function summary(n) {
  const days = lastDays(n);
  const st = { ontime: 0, jamaah: 0, late: 0 };
  days.forEach(k => PRAYERS.forEach(p => { const s = prayerStatus(k, p[0]); if (s) st[s]++; }));
  const prayed = st.ontime + st.jamaah + st.late;
  const line = (name, value, sub) => `<div class="row log"><span>${name}${sub ? `<small>${sub}</small>` : ''}</span><b>${value}</b></div>`;
  const rows = [
    line('Prayers', `${prayed}/${n * 5}`, prayed ? `${st.ontime} on time · ${st.jamaah} jama’ah · ${st.late} late` : ''),
    line('Morning adhkar', `${days.filter(k => adhkarProgress(k, 'morning').complete).length}/${n} days`),
    line('Evening adhkar', `${days.filter(k => adhkarProgress(k, 'evening').complete).length}/${n} days`)
  ];
  state.habits.forEach(h => {
    const hit = days.filter(k => peek(k).h[h.id]);
    if (h.id === 'gym') {
      const mins = hit.reduce((s, k) => s + (Number(obj(peek(k).gymLog).min) || 0), 0);
      rows.push(line(esc(h.name), `${hit.length} session${hit.length === 1 ? '' : 's'}`, mins ? `${Math.floor(mins / 60)} h ${mins % 60} min in total` : ''));
    } else {
      rows.push(line(esc(h.name), h.daily ? `${hit.length}/${n} days` : `${hit.length} time${hit.length === 1 ? '' : 's'}`));
    }
  });
  const w = weightEntries().filter(e => e.k >= days[0]);
  rows.push(`<div class="row log"><span>Weight change${w.length ? `<small>${w.length} entr${w.length === 1 ? 'y' : 'ies'}</small>` : ''}</span>
    ${w.length > 1 ? delta(w[w.length - 1].w, w[0].w) + '<b>kg</b>' : '<b>—</b>'}</div>`);
  return rows.join('');
}

function renderProgress() {
  const days = lastDays(30);
  return `${title('Progress', 'Summary and last 30 days')}
  <div class="seg">
    ${[[7, 'This week'], [30, 'This month']].map(([n, l]) =>
      `<button class="${span === n ? 'on' : ''}" data-act="span" data-id="${n}">${l}</button>`).join('')}
  </div>
  <p class="hint">Last ${span} days, including today</p>
  <section class="card rows">${summary(span)}</section>

  <h3>Last 30 days</h3>
  ${trackers().map(h => {
    const levels = days.map(h.level);
    const full = levels.filter(l => l >= 1).length;
    return `<section class="card habit">
      <div class="head"><h2>${esc(h.name)}</h2>${h.daily ? `<span>🔥 ${streak(h.level)}</span>` : ''}<span>${full}/30</span></div>
      <div class="grid30">${levels.map((l, i) =>
        `<i title="${days[i]}" style="--l:${l}" class="${l >= 1 ? 'full' : l > 0 ? 'part' : ''}"></i>`).join('')}</div>
    </section>`;
  }).join('')}`;
}

// ---------- Settings ----------
function renderSettings() {
  const s = state.settings;
  const t = timesFor(todayKey());
  const notifState = !('Notification' in window) ? 'Not supported in this browser'
    : Notification.permission === 'denied' ? 'Blocked — allow notifications for this app in your phone settings'
      : 'Only while the app is open or recently used';
  return `${title('Settings', 'Prayer times, reminders and backup')}
  <h3>Appearance</h3>
  <div class="seg">
    ${[['light', '☀️ Light'], ['dark', '🌙 Dark'], ['auto', 'Auto']].map(([id, l]) =>
      `<button class="${theme === id ? 'on' : ''}" data-act="theme" data-id="${id}">${l}</button>`).join('')}
  </div>

  <h3>Prayer times</h3>
  <section class="card rows">
    <button class="row" data-act="locate"><span>📍 Use my current location<small>${hasLocation()
      ? `Set to ${s.lat.toFixed(2)}, ${s.lng.toFixed(2)}` : 'Not set yet'}</small></span><b>›</b></button>
    <form class="row edit" data-form="coords">
      <input type="number" name="lat" step="any" min="-90" max="90" inputmode="decimal" placeholder="Latitude" value="${hasLocation() ? s.lat : ''}" required aria-label="Latitude">
      <input type="number" name="lng" step="any" min="-180" max="180" inputmode="decimal" placeholder="Longitude" value="${hasLocation() ? s.lng : ''}" required aria-label="Longitude">
      <button type="submit" class="add">Set</button>
    </form>
    <label class="row"><span>Calculation method</span>
      <select data-act="method">${Object.keys(CALC_METHODS).map(id =>
        `<option value="${id}" ${s.method === id ? 'selected' : ''}>${CALC_METHODS[id].name}</option>`).join('')}</select></label>
    <label class="row"><span>Asr</span>
      <select data-act="asr"><option value="1" ${s.asr !== 2 ? 'selected' : ''}>Standard (Shafi, Maliki, Hanbali)</option>
        <option value="2" ${s.asr === 2 ? 'selected' : ''}>Hanafi</option></select></label>
    ${t ? `<div class="row times">${PRAYERS.map(([id, en]) => `<span>${en}<b>${hhmm(t[id])}</b></span>`).join('')}</div>` : ''}
  </section>
  <p class="hint">Times are calculated on your phone and can differ by a few minutes from your mosque’s timetable.</p>

  <h3>Reminders</h3>
  <section class="card rows">
    <button class="row ${s.remind && canNotify() ? 'on' : ''}" data-act="remind">
      <i class="check"></i><span>Notify me at prayer and adhkar times<small>${notifState}</small></span>
    </button>
    <button class="row" data-act="calendar"><span>📅 Add prayer times to my calendar<small>Next 30 days, with an alert at each prayer — works even when the app is closed</small></span><b>›</b></button>
  </section>

  <h3>Backup</h3>
  <section class="card rows">
    <button class="row" data-act="export"><span>Export data<small>Download a JSON backup</small></span><b>›</b></button>
    <label class="row"><span>Import data<small>Restore from a backup file</small></span><b>›</b>
      <input type="file" accept="application/json,.json" data-act="import" hidden></label>
  </section>
  <p class="hint center">Everything is stored on this device only.</p>`;
}

const VIEWS = { today: renderToday, adhkar: renderAdhkar, weight: renderWeight, progress: renderProgress, settings: renderSettings };

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
  editing = false;
  render(false);
});

function setLocation(lat, lng) {
  state.settings.lat = Math.round(lat * 10000) / 10000;
  state.settings.lng = Math.round(lng * 10000) / 10000;
  save();
  scheduleReminders();
  render();
}

view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || ['INPUT', 'SELECT'].includes(el.tagName)) return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'prev': cur = shift(cur, -1); break;
    case 'next': if (cur < todayKey()) cur = shift(cur, 1); break;
    case 'go': tab = id; render(false); return;
    case 'prayer': {
      const next = STATUS_NEXT[prayerStatus(cur, id)];
      if (next) day(cur).prayers[id] = next; else delete day(cur).prayers[id];
      buzz();
      break;
    }
    case 'extra': { const d = day(cur); d.extra[id] = !d.extra[id]; buzz(); break; }
    case 'habit': { const d = day(cur); d.h[id] = !d.h[id]; buzz(); break; }
    case 'edit-habits': editing = !editing; break;
    case 'del-habit': {
      const h = state.habits.find(x => x.id === id);
      if (!h || !confirm(`Remove “${h.name}” from your habits?`)) return;
      state.habits = state.habits.filter(x => x.id !== id);
      break;
    }
    case 'gym-part': {
      const d = day(cur);
      const log = d.gymLog = obj(d.gymLog);
      const parts = Array.isArray(log.parts) ? log.parts : [];
      log.parts = parts.includes(id) ? parts.filter(p => p !== id) : parts.concat(id);
      break;
    }
    case 'open-adhkar': period = id; tab = 'adhkar'; render(false); return;
    case 'period': period = id; render(false); return;
    case 'dhikr': {
      const a = adhkarList(period).find(x => x.id === id);
      const d = day(cur);
      const counts = d.adhkar[period] = obj(d.adhkar[period]);
      if ((counts[id] || 0) >= a.count) return;
      counts[id] = (counts[id] || 0) + 1;
      buzz(counts[id] >= a.count ? 40 : 8);
      break;
    }
    case 'reset-adhkar':
      if (!confirm('Reset these adhkar for this day?')) return;
      day(cur).adhkar[period] = {};
      break;
    case 'tasbih': {
      const tb = state.tasbih;
      tb.count++;
      buzz(tb.target && tb.count % tb.target === 0 ? 120 : 8);
      break;
    }
    case 'tasbih-target': state.tasbih.target = Number(id); break;
    case 'tasbih-reset': state.tasbih.count = 0; break;
    case 'range': range = Number(id); break;
    case 'span': span = Number(id); break;
    case 'theme': theme = id; applyTheme(); render(); return;
    case 'del-weight':
      if (!confirm('Delete this entry?')) return;
      delete state.weights[id];
      break;
    case 'locate':
      if (!navigator.geolocation) { alert('Location is not available here. Type your coordinates instead.'); return; }
      navigator.geolocation.getCurrentPosition(
        p => setLocation(p.coords.latitude, p.coords.longitude),
        () => alert('Could not get your location. Allow location access, or type your coordinates below.'),
        { timeout: 15000, maximumAge: 3600000 }
      );
      return;
    case 'remind': toggleReminders(); return;
    case 'calendar': exportCalendar(); return;
    case 'export': download(JSON.stringify(state, null, 2), `habits-backup-${todayKey()}.json`, 'application/json'); return;
    default: return;
  }
  save();
  render();
});

async function toggleReminders() {
  const s = state.settings;
  if (s.remind && canNotify()) {
    s.remind = false;
  } else {
    if (!('Notification' in window)) {
      alert('Notifications are not available here. On iPhone, add the app to your Home Screen first, then open it from there.');
      return;
    }
    if (!hasLocation()) { alert('Set your location first so prayer times can be calculated.'); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { alert('Notifications are blocked. Allow them for this app in your phone settings.'); render(); return; }
    s.remind = true;
  }
  save();
  scheduleReminders();
  render();
}

view.addEventListener('submit', e => {
  const form = e.target.dataset.form;
  if (!form) return;
  e.preventDefault();
  const f = new FormData(e.target);
  const n = name => parseFloat(String(f.get(name)).replace(',', '.'));
  if (form === 'weight') {
    const date = f.get('date');
    const kg = Math.round(n('kg') * 10) / 10;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey() || !(kg >= 20 && kg <= 400)) return;
    state.weights[date] = kg;
  } else if (form === 'goal') {
    const goal = n('goal'), height = n('height');
    state.goal = goal >= 20 && goal <= 400 ? Math.round(goal * 10) / 10 : null;
    state.height = height >= 80 && height <= 250 ? Math.round(height) : null;
  } else if (form === 'habit') {
    const name = String(f.get('name')).trim().slice(0, 40);
    if (!name) return;
    state.habits.push({ id: 'h' + Date.now().toString(36), name, daily: f.get('daily') === 'on' });
  } else if (form === 'coords') {
    const lat = n('lat'), lng = n('lng');
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return;
    setLocation(lat, lng);
    return;
  }
  save();
  render();
});

view.addEventListener('change', e => {
  const el = e.target;
  const { act, id } = el.dataset;
  const habit = state.habits.find(h => h.id === id);
  switch (act) {
    case 'rename': {
      const name = el.value.trim().slice(0, 40);
      if (habit && name) habit.name = name; else if (habit) el.value = habit.name;
      save();
      return;
    }
    case 'daily': if (habit) habit.daily = el.checked; save(); return;
    case 'gym-min': {
      const d = day(cur);
      const log = d.gymLog = obj(d.gymLog);
      log.min = Math.max(0, Math.min(600, Math.round(Number(el.value) || 0)));
      save();
      return;
    }
    case 'method': state.settings.method = el.value; break;
    case 'asr': state.settings.asr = Number(el.value) === 2 ? 2 : 1; break;
    case 'import':
      if (!el.files[0]) return;
      el.files[0].text().then(text => {
        const data = JSON.parse(text);
        if (!data || typeof data.days !== 'object' || typeof data.weights !== 'object') throw new Error('bad file');
        if (!confirm('Replace all current data with this backup?')) return;
        state = normalize(data);
        save();
        scheduleReminders();
        render();
      }).catch(() => alert('That file is not a valid backup.'));
      return;
    default: return;
  }
  save();
  scheduleReminders();
  render();
});

function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Calendar file with one event and alert per prayer, so the phone's own calendar does the reminding.
function exportCalendar() {
  if (!hasLocation()) { alert('Set your location first so prayer times can be calculated.'); return; }
  const z = d => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const stamp = z(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Habits//Prayer times//EN', 'CALSCALE:GREGORIAN'];
  for (let i = 0; i < 30; i++) {
    const key = shift(todayKey(), i);
    const t = timesFor(key);
    if (!t) continue;
    for (const [id, en] of PRAYERS) {
      lines.push('BEGIN:VEVENT', `UID:${key}-${id}@habits-app`, `DTSTAMP:${stamp}`, `DTSTART:${z(t[id])}`,
        `DTEND:${z(new Date(t[id].getTime() + 10 * 60000))}`, `SUMMARY:${en} prayer`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${en} prayer`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  download(lines.join('\r\n'), 'prayer-times.ics', 'text/calendar');
}

// Keep the "next prayer" countdown fresh, and roll over to the new day after midnight.
let lastSeen = todayKey();
function refresh() {
  if (lastSeen !== todayKey()) {
    if (cur === lastSeen) cur = todayKey();
    lastSeen = todayKey();
    scheduleReminders();
    render();
    return;
  }
  const el = document.getElementById('next');
  if (el) el.innerHTML = nextPrayerText();
}
setInterval(refresh, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  refresh();
  scheduleReminders();
});

applyTheme();
render();
scheduleReminders();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
