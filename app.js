'use strict';

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const r0 = n => Math.round(n);
const r1 = n => Math.round(n * 10) / 10;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => new Date(s + 'T12:00:00');
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());

/* ---------- reference data ---------- */
// [name, kcal, protein, carbs, fat] per 100 g, and a typical serving in grams
const FOODS = [
  ['Chicken breast, cooked', 165, 31, 0, 3.6, 150], ['Rice, cooked', 130, 2.7, 28, 0.3, 180],
  ['Egg', 143, 12.6, 0.7, 9.5, 50], ['Oats, dry', 379, 13, 68, 6.5, 50],
  ['Banana', 89, 1.1, 23, 0.3, 120], ['Apple', 52, 0.3, 14, 0.2, 180],
  ['Bread, whole wheat', 250, 12, 43, 3.5, 35], ['Pasta, cooked', 158, 5.8, 31, 0.9, 200],
  ['Potato, boiled', 87, 1.9, 20, 0.1, 200], ['Beef mince, cooked', 250, 26, 0, 15, 120],
  ['Salmon, cooked', 206, 22, 0, 12, 140], ['Tuna, canned in water', 116, 26, 0, 1, 100],
  ['Greek yogurt, plain', 97, 9, 3.9, 5, 170], ['Milk, 2%', 50, 3.4, 4.8, 2, 250],
  ['Cheese, cheddar', 403, 25, 1.3, 33, 30], ['Cottage cheese', 98, 11, 3.4, 4.3, 150],
  ['Butter', 717, 0.9, 0.1, 81, 10], ['Olive oil', 884, 0, 0, 100, 14],
  ['Peanut butter', 588, 25, 20, 50, 32], ['Almonds', 579, 21, 22, 50, 30],
  ['Avocado', 160, 2, 9, 15, 100], ['Broccoli', 34, 2.8, 7, 0.4, 150],
  ['Tomato', 18, 0.9, 3.9, 0.2, 120], ['Cucumber', 15, 0.7, 3.6, 0.1, 150],
  ['Lentils, cooked', 116, 9, 20, 0.4, 200], ['Black beans, cooked', 132, 8.9, 24, 0.5, 170],
  ['Tofu, firm', 144, 17, 3, 9, 120], ['Whey protein powder', 400, 80, 8, 6, 30],
  ['Orange juice', 45, 0.7, 10, 0.2, 250], ['Dark chocolate', 598, 7.8, 46, 43, 25],
  ['Pizza, cheese', 266, 11, 33, 10, 110], ['Burger with bun', 254, 13, 24, 12, 220],
  ['French fries', 312, 3.4, 41, 15, 120], ['Honey', 304, 0.3, 82, 0, 21],
];
// [name, emoji, MET]
const SPORTS = [
  ['Strength training', '🏋️', 5], ['Running', '🏃', 9.8], ['Walking', '🚶', 3.5], ['Cycling', '🚴', 7.5],
  ['Swimming', '🏊', 7], ['HIIT', '⚡', 8], ['Yoga', '🧘', 2.8], ['Football', '⚽', 7],
  ['Basketball', '🏀', 6.5], ['Boxing', '🥊', 7.8], ['Hiking', '🥾', 6], ['Rowing', '🚣', 7],
  ['Dancing', '💃', 5], ['Stretching', '🤸', 2.3], ['Other', '💪', 5],
];
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const ACTIVITY = [[1.2, 'Sedentary (desk job, little exercise)'], [1.375, 'Light (1–3 workouts/week)'], [1.55, 'Moderate (3–5 workouts/week)'], [1.725, 'Very active (6–7 workouts/week)'], [1.9, 'Athlete / physical job']];
const GOALS = [[-500, 'Lose ~0.5 kg/week'], [-250, 'Lose ~0.25 kg/week'], [0, 'Maintain weight'], [250, 'Gain ~0.25 kg/week'], [500, 'Gain ~0.5 kg/week']];
const HABIT_ICONS = ['💧', '🏃', '📖', '🧘', '😴', '🥗', '💊', '🚭', '🦷', '✍️', '🎯', '🧹'];

/* ---------- state ---------- */
const KEY = 'daytrack.v1';
const blank = () => ({ profile: null, habits: [], habitLog: {}, meals: {}, workouts: {}, recents: [] });
let S = blank();
try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* start fresh */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('Could not save — storage is full or disabled.'); } };

let tab = 'today';
let day = today();
let draft = null; // food being added: per-gram values for live recalculation

/* ---------- calculations ---------- */
function targets() {
  const p = S.profile;
  if (!p) return { set: false, goal: 2000, protein: 120, carbs: 250, fat: 60 };
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161); // Mifflin-St Jeor
  const tdee = bmr * p.activity;
  const goal = Math.max(1200, r0(tdee + p.goal));
  const protein = r0(p.weight * 1.8);
  const fat = r0(goal * 0.25 / 9);
  const carbs = Math.max(0, r0((goal - protein * 4 - fat * 9) / 4));
  return { set: true, bmr: r0(bmr), tdee: r0(tdee), goal, protein, carbs, fat, bmi: p.weight / (p.height / 100) ** 2 };
}
function dayTotals(d) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, burned: 0, min: 0 };
  for (const m of S.meals[d] || []) { t.kcal += m.kcal; t.p += m.p; t.c += m.c; t.f += m.f; }
  for (const w of S.workouts[d] || []) { t.burned += w.kcal; t.min += w.min; }
  return t;
}
const done = (id, d) => !!(S.habitLog[d] && S.habitLog[d][id]);
function streak(id) {
  let d = today(), n = 0;
  if (!done(id, d)) d = addDays(d, -1); // today still open doesn't break the streak
  while (done(id, d)) { n++; d = addDays(d, -1); }
  return n;
}
const burnFor = (met, min) => r0(met * (S.profile ? S.profile.weight : 70) * min / 60);

/* ---------- views ---------- */
function ring(eaten, goal) {
  const R = 58, C = 2 * Math.PI * R, pct = Math.max(0, Math.min(1, goal ? eaten / goal : 0)), over = eaten > goal;
  return `<svg width="132" height="132"><circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--line)" stroke-width="12"/>
    <circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--${over ? 'danger' : 'accent'})" stroke-width="12" stroke-linecap="round"
    stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>`;
}
function calorieCard() {
  const g = targets(), t = dayTotals(day), left = g.goal - t.kcal + t.burned;
  const macro = (label, v, max, col) => `<div class="macro">${label}<div class="bar"><i style="width:${Math.min(100, max ? v / max * 100 : 0)}%;background:var(--${col})"></i></div><b>${r0(v)} / ${max} g</b></div>`;
  return `<div class="card">
    <div class="ringrow">
      <div class="ring">${ring(t.kcal - t.burned, g.goal)}<div class="mid"><b>${Math.abs(r0(left))}</b><span>kcal ${left < 0 ? 'over' : 'left'}</span></div></div>
      <div class="stats">
        <div><span>Goal</span><b>${g.goal}</b></div>
        <div><span>Food</span><b>${r0(t.kcal)}</b></div>
        <div><span>Exercise</span><b>−${r0(t.burned)}</b></div>
      </div>
    </div>
    <div class="macros">${macro('Protein', t.p, g.protein, 'p')}${macro('Carbs', t.c, g.carbs, 'c')}${macro('Fat', t.f, g.fat, 'f')}</div>
    ${g.set ? '' : '<button class="btn ghost" data-a="tab" data-tab="profile">Set up your calorie goal</button>'}
  </div>`;
}
function vToday() {
  const hs = S.habits, nDone = hs.filter(h => done(h.id, day)).length, t = dayTotals(day);
  const ws = S.workouts[day] || [];
  return calorieCard() + `
  <div class="card"><h2>Habits <small>${hs.length ? `${nDone} of ${hs.length} done` : ''}</small></h2>
    ${hs.length ? hs.map(h => `<div class="row" data-a="toggle" data-id="${h.id}" data-d="${day}">
      <span class="emoji">${h.icon}</span><div class="grow"><div class="name">${esc(h.name)}</div></div>
      <span class="check ${done(h.id, day) ? 'on' : ''}">✓</span></div>`).join('')
      : '<div class="empty">No habits yet.</div><button class="btn ghost" data-a="newhabit">Add your first habit</button>'}
  </div>
  <div class="card"><h2>Meals <button class="add" data-a="tab" data-tab="meals">Open</button></h2>
    ${MEALS.map(m => { const k = (S.meals[day] || []).filter(x => x.meal === m).reduce((a, x) => a + x.kcal, 0);
      return `<div class="row"><div class="grow">${m}</div><span class="val">${k ? r0(k) + ' kcal' : '<span class="muted">—</span>'}</span></div>`; }).join('')}
  </div>
  <div class="card"><h2>Training <button class="add" data-a="tab" data-tab="training">Open</button></h2>
    ${ws.length ? `<div class="row"><div class="grow">${ws.length} workout${ws.length > 1 ? 's' : ''} · ${t.min} min</div><span class="val">${r0(t.burned)} kcal</span></div>` : '<div class="empty">Nothing logged for this day.</div>'}
  </div>`;
}
function vHabits() {
  const end = today(), days = [...Array(7)].map((_, i) => addDays(end, i - 6));
  return (S.habits.length ? S.habits.map(h => { const s = streak(h.id); return `<div class="card">
    <div class="row"><span class="emoji">${h.icon}</span><div class="grow"><div class="name">${esc(h.name)}</div></div>
      ${s ? `<span class="streak">🔥 ${s} day${s > 1 ? 's' : ''}</span>` : ''}
      <button class="x" data-a="delhabit" data-id="${h.id}" aria-label="Delete">✕</button></div>
    <div class="week">${days.map(d => `<button class="${done(h.id, d) ? 'on' : ''} ${d === end ? 'today' : ''}" data-a="toggle" data-id="${h.id}" data-d="${d}">
      ${parse(d).toLocaleDateString(undefined, { weekday: 'narrow' })}<b>${parse(d).getDate()}</b></button>`).join('')}</div>
  </div>`; }).join('') : '<div class="card"><div class="empty">Habits you add show up here with a 7-day view and streaks. Tap a day to mark it done.</div></div>')
  + '<button class="btn" data-a="newhabit">＋ New habit</button>';
}
function vMeals() {
  const list = S.meals[day] || [];
  return calorieCard() + MEALS.map(m => { const items = list.filter(x => x.meal === m), k = items.reduce((a, x) => a + x.kcal, 0);
    return `<div class="card"><h2>${m} <small>${k ? r0(k) + ' kcal' : ''}<button class="add" data-a="newmeal" data-meal="${m}">＋ Add</button></small></h2>
    ${items.map(x => `<div class="row"><div class="grow"><div class="name">${esc(x.name)}</div>
      <div class="sub">${x.g ? r0(x.g) + ' g · ' : ''}P ${r1(x.p)} · C ${r1(x.c)} · F ${r1(x.f)}</div></div>
      <span class="val">${r0(x.kcal)}</span><button class="x" data-a="delmeal" data-id="${x.id}" aria-label="Delete">✕</button></div>`).join('') || '<div class="empty">Nothing yet.</div>'}
    </div>`; }).join('');
}
function vTraining() {
  const ws = S.workouts[day] || [], t = dayTotals(day);
  const week = [...Array(7)].map((_, i) => addDays(day, -i)).reduce((a, d) => { const x = dayTotals(d); a.n += (S.workouts[d] || []).length; a.min += x.min; a.kcal += x.burned; return a; }, { n: 0, min: 0, kcal: 0 });
  return `<div class="card"><h2>This day <small>${t.min} min · ${r0(t.burned)} kcal</small></h2>
    ${ws.map(w => { const sp = SPORTS.find(s => s[0] === w.type) || SPORTS[SPORTS.length - 1];
      return `<div class="row"><span class="emoji">${sp[1]}</span><div class="grow"><div class="name">${esc(w.type)}</div>
      <div class="sub">${w.min} min${w.notes ? ' · ' + esc(w.notes) : ''}</div></div>
      <span class="val">${r0(w.kcal)} kcal</span><button class="x" data-a="delworkout" data-id="${w.id}" aria-label="Delete">✕</button></div>`; }).join('') || '<div class="empty">No workouts logged.</div>'}
    <button class="btn" data-a="newworkout">＋ Log workout</button></div>
  <div class="card"><h2>Last 7 days</h2>
    <div class="kv"><span>Workouts</span><b>${week.n}</b></div>
    <div class="kv"><span>Active time</span><b>${week.min} min</b></div>
    <div class="kv"><span>Calories burned</span><b>${r0(week.kcal)} kcal</b></div></div>`;
}
function vProfile() {
  const p = S.profile || { sex: 'm', age: '', height: '', weight: '', activity: 1.375, goal: 0 }, g = targets();
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${v == cur ? 'selected' : ''}>${l}</option>`).join('');
  const bmiLabel = b => b < 18.5 ? 'underweight' : b < 25 ? 'healthy range' : b < 30 ? 'overweight' : 'obese range';
  return (g.set ? `<div class="card"><h2>Your daily target</h2><div class="big">${g.goal} <span class="muted">kcal</span></div>
    <div class="kv"><span>BMR (calories at rest)</span><b>${g.bmr} kcal</b></div>
    <div class="kv"><span>Maintenance (TDEE)</span><b>${g.tdee} kcal</b></div>
    <div class="kv"><span>Protein / Carbs / Fat</span><b>${g.protein} / ${g.carbs} / ${g.fat} g</b></div>
    <div class="kv"><span>BMI</span><b>${r1(g.bmi)} · ${bmiLabel(g.bmi)}</b></div></div>` : '')
  + `<div class="card"><h2>Calorie calculator</h2><form data-form="profile">
    <div class="g2"><label>Sex<select name="sex">${opt([['m', 'Male'], ['f', 'Female']], p.sex)}</select></label>
      <label>Age<input name="age" inputmode="numeric" required value="${p.age}"></label></div>
    <div class="g2"><label>Height (cm)<input name="height" inputmode="decimal" required value="${p.height}"></label>
      <label>Weight (kg)<input name="weight" inputmode="decimal" required value="${p.weight}"></label></div>
    <label>Activity level<select name="activity">${opt(ACTIVITY, p.activity)}</select></label>
    <label>Goal<select name="goal">${opt(GOALS, p.goal)}</select></label>
    <button class="btn">${g.set ? 'Recalculate' : 'Calculate'}</button></form></div>
  <div class="card"><h2>Your data</h2><div class="muted">Everything is stored only on this device. Export a backup now and then.</div>
    <button class="btn ghost" data-a="export">Export backup</button>
    <button class="btn ghost" data-a="import">Import backup</button>
    <button class="btn danger" data-a="reset">Erase all data</button>
    <input type="file" id="file" accept="application/json,.json" hidden></div>`;
}

const VIEWS = { today: ['Today', vToday, 1], habits: ['Habits', vHabits, 0], meals: ['Meals', vMeals, 1], training: ['Training', vTraining, 1], profile: ['Calories', vProfile, 0] };
function render() {
  const [title, fn, dated] = VIEWS[tab];
  $('#title').textContent = title;
  $('#datenav').style.display = dated ? '' : 'none';
  const t = today();
  $('#datelabel').textContent = day === t ? 'Today' : day === addDays(t, -1) ? 'Yesterday' : parse(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const v = $('#view'), y = v.scrollTop;
  v.innerHTML = fn();
  v.scrollTop = y;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

/* ---------- sheets ---------- */
function openSheet(html) { $('#sheet').innerHTML = html; $('#sheet').hidden = $('#backdrop').hidden = false; }
function closeSheet() { $('#sheet').hidden = $('#backdrop').hidden = true; $('#sheet').innerHTML = ''; draft = null; }

function habitSheet() {
  openSheet(`<h2>New habit</h2><form data-form="habit">
    <label>Name<input name="name" required maxlength="40" placeholder="e.g. Drink 2 L of water" autocomplete="off"></label>
    <input type="hidden" name="icon" value="${HABIT_ICONS[0]}">
    <div class="chips">${HABIT_ICONS.map((i, n) => `<button type="button" class="${n ? '' : 'on'}" data-a="icon" data-i="${i}">${i}</button>`).join('')}</div>
    <button class="btn">Add habit</button></form>`);
}
function mealSheet(meal) {
  draft = null;
  openSheet(`<h2>Add to ${meal}</h2><form data-form="meal" data-meal="${meal}">
    <label>Food<input name="name" required maxlength="60" placeholder="Search or type any food" autocomplete="off"></label>
    <div class="chips" id="sugg"></div>
    <div class="g2"><label>Amount (g)<input name="g" inputmode="decimal" placeholder="optional"></label>
      <label>Calories<input name="kcal" inputmode="decimal" required></label></div>
    <div class="g3"><label>Protein (g)<input name="p" inputmode="decimal"></label><label>Carbs (g)<input name="c" inputmode="decimal"></label><label>Fat (g)<input name="f" inputmode="decimal"></label></div>
    <button class="btn">Add food</button></form>`);
  suggest('');
}
let pool = [];
function suggest(q) {
  q = q.trim().toLowerCase();
  const rec = S.recents.map(x => ({ name: x.name, g: x.g, per: x.g ? [x.kcal / x.g, x.p / x.g, x.c / x.g, x.f / x.g] : null, flat: x }));
  const db = FOODS.filter(f => !S.recents.some(x => x.name === f[0])).map(f => ({ name: f[0], g: f[5], per: [f[1] / 100, f[2] / 100, f[3] / 100, f[4] / 100] }));
  pool = [...rec, ...db].filter(x => x.name.toLowerCase().includes(q)).slice(0, 8);
  const el = $('#sugg'); if (el) el.innerHTML = pool.map((x, i) => `<button type="button" data-a="pick" data-i="${i}">${esc(x.name)}</button>`).join('');
}
function fillFood(f) {
  if (!draft) return;
  const g = num(f.g.value), [k, p, c, fa] = draft.map(v => v * g);
  f.kcal.value = r0(k); f.p.value = r1(p); f.c.value = r1(c); f.f.value = r1(fa);
}
function workoutSheet() {
  openSheet(`<h2>Log workout</h2><form data-form="workout">
    <label>Activity<select name="type">${SPORTS.map(s => `<option>${s[0]}</option>`).join('')}</select></label>
    <div class="g2"><label>Duration (min)<input name="min" inputmode="numeric" required value="45"></label>
      <label>Calories burned<input name="kcal" inputmode="numeric" required></label></div>
    <label>Notes<input name="notes" maxlength="80" placeholder="e.g. Squat 5×5 80 kg, 5 km" autocomplete="off"></label>
    <div class="muted">Calories are estimated from the activity, duration and your weight${S.profile ? '' : ' (70 kg assumed until you fill in the Calories tab)'}. You can overwrite the number.</div>
    <button class="btn">Save workout</button></form>`);
  estimate($('#sheet form'));
}
function estimate(f) {
  if (f.dataset.manual) return;
  const sp = SPORTS.find(s => s[0] === f.type.value);
  f.kcal.value = burnFor(sp[2], num(f.min.value));
}

/* ---------- actions ---------- */
const ACTIONS = {
  tab: e => { tab = e.dataset.tab; render(); $('#view').scrollTop = 0; },
  day: e => { const n = +e.dataset.n; day = n ? addDays(day, n) : today(); render(); },
  close: closeSheet,
  toggle: e => { const l = S.habitLog[e.dataset.d] ||= {}; if (l[e.dataset.id]) delete l[e.dataset.id]; else l[e.dataset.id] = 1; save(); render(); },
  newhabit: habitSheet,
  icon: e => { e.closest('form').icon.value = e.dataset.i; e.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e)); },
  delhabit: e => { const h = S.habits.find(x => x.id === e.dataset.id); if (h && confirm(`Delete “${h.name}” and its history?`)) {
    S.habits = S.habits.filter(x => x !== h); for (const d in S.habitLog) delete S.habitLog[d][h.id]; save(); render(); } },
  newmeal: e => mealSheet(e.dataset.meal),
  pick: e => { const x = pool[+e.dataset.i], f = e.closest('form'); f.name.value = x.name;
    if (x.per) { draft = x.per; f.g.value = r0(x.g); fillFood(f); }
    else { draft = null; f.g.value = ''; f.kcal.value = r0(x.flat.kcal); f.p.value = r1(x.flat.p); f.c.value = r1(x.flat.c); f.f.value = r1(x.flat.f); }
    $('#sugg').innerHTML = ''; },
  delmeal: e => { S.meals[day] = (S.meals[day] || []).filter(x => x.id !== e.dataset.id); save(); render(); },
  newworkout: workoutSheet,
  delworkout: e => { S.workouts[day] = (S.workouts[day] || []).filter(x => x.id !== e.dataset.id); save(); render(); },
  export: async () => {
    const name = `daytrack-backup-${today()}.json`, data = JSON.stringify(S, null, 1);
    const file = new File([data], name, { type: 'application/json' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (err) { if (err.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  import: () => $('#file').click(),
  reset: () => { if (confirm('Erase all habits, meals, workouts and your profile from this device?')) { S = blank(); save(); render(); } },
};
document.addEventListener('click', ev => { const e = ev.target.closest('[data-a]'); if (e && ACTIONS[e.dataset.a]) ACTIONS[e.dataset.a](e); });

const FORMS = {
  habit: f => { S.habits.push({ id: uid(), name: f.name.value.trim(), icon: f.icon.value }); },
  meal: f => {
    const x = { id: uid(), meal: f.dataset.meal, name: f.name.value.trim(), g: num(f.g.value), kcal: num(f.kcal.value), p: num(f.p.value), c: num(f.c.value), f: num(f.f.value) };
    (S.meals[day] ||= []).push(x);
    S.recents = [{ name: x.name, g: x.g, kcal: x.kcal, p: x.p, c: x.c, f: x.f }, ...S.recents.filter(r => r.name !== x.name)].slice(0, 30);
  },
  workout: f => { (S.workouts[day] ||= []).push({ id: uid(), type: f.type.value, min: r0(num(f.min.value)), kcal: r0(num(f.kcal.value)), notes: f.notes.value.trim() }); },
  profile: f => {
    const p = { sex: f.sex.value, age: num(f.age.value), height: num(f.height.value), weight: num(f.weight.value), activity: num(f.activity.value), goal: num(f.goal.value) };
    if (p.age < 10 || p.age > 110 || p.height < 100 || p.height > 250 || p.weight < 25 || p.weight > 350) { alert('Please check age, height (cm) and weight (kg).'); return false; }
    S.profile = p;
  },
};
document.addEventListener('submit', ev => {
  ev.preventDefault();
  const f = ev.target, fn = FORMS[f.dataset.form];
  if (!fn || fn(f) === false) return;
  save(); closeSheet(); render();
  if (f.dataset.form === 'profile') $('#view').scrollTop = 0;
});
document.addEventListener('input', ev => {
  const el = ev.target, f = el.form; if (!f) return;
  if (f.dataset.form === 'meal') {
    if (el.name === 'name') { draft = null; suggest(el.value); }
    else if (el.name === 'g') fillFood(f);
    else draft = null; // manual numbers win over the per-gram estimate
  } else if (f.dataset.form === 'workout') {
    if (el.name === 'kcal') f.dataset.manual = 1; else estimate(f);
  }
});
document.addEventListener('change', async ev => {
  if (ev.target.id !== 'file' || !ev.target.files[0]) return;
  try {
    const d = JSON.parse(await ev.target.files[0].text());
    if (!d || !Array.isArray(d.habits) || typeof d.meals !== 'object') throw 0;
    if (confirm('Replace everything on this device with the backup?')) { S = Object.assign(blank(), d); save(); render(); }
  } catch (e) { alert('That file is not a DayTrack backup.'); }
});

// roll over to the new day when the app is reopened after midnight
let lastSeen = today();
document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== lastSeen) { if (day === lastSeen) day = today(); lastSeen = today(); render(); } });

render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
