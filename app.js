/* تمريني — تطبيق التمارين والأكل */
'use strict';

const APP_VERSION = '1.0.0';
const LS_STATE = 'fitapp_state_v1';
const LS_META = 'fitapp_meta_v1';

/* ================= أدوات عامة ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const r1 = n => Math.round(n * 10) / 10;
const r0 = n => Math.round(n);
const round25 = n => Math.max(0, Math.round(n / 2.5) * 2.5);
const num = v => { const x = parseFloat(String(v).replace(',', '.').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))); return isNaN(x) ? null : x; };
const fmt = n => (n == null || isNaN(n)) ? '—' : (Math.abs(n) >= 100 || Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : r1(n).toString());

/* التواريخ (توقيت الجهاز) */
const pad = n => String(n).padStart(2, '0');
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ds(new Date());
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const dow = s => pd(s).getDay(); // 0 أحد ... 6 سبت
const daysBetween = (a, b) => Math.round((pd(b) - pd(a)) / 86400000);
const weekStart = s => { const w = dow(s); const back = (w - 6 + 7) % 7; return addDays(s, -back); }; // الأسبوع يبدأ السبت
const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const dLabel = s => { const d = pd(s); return `${DAY_AR[d.getDay()]} ${d.getDate()} ${MONTH_AR[d.getMonth()]}`; };
const dShort = s => { const d = pd(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
const isTrainDow = s => [6, 1, 2, 3, 4].includes(dow(s));
const scheduledDay = s => WEEK_ORDER.find(k => PROGRAM[k].dow === dow(s)) || null;

/* ================= الحالة والتخزين ================= */
function defaultState() {
  return {
    v: 1,
    cfg: {
      startDate: today(),
      targets: { train: { kcal: 2700, p: 110, f: 70, c: 400 }, rest: { kcal: 2500, p: 110, f: 70, c: 350 } },
      waterGoal: 3000,
      supps: DEFAULT_SUPPS.slice(),
      fb: null
    },
    foods: {}, recent: [], lastQty: {}, templates: {},
    notes: {}, videos: {}, swaps: {}, prs: {},
    weights: {}, plan: {}, skips: {},
    sess: {}, diary: {}
  };
}
let S;
let META = { u: {}, dirty: {} };
function load() {
  try { S = JSON.parse(localStorage.getItem(LS_STATE)) || defaultState(); } catch (e) { S = defaultState(); }
  const d = defaultState();
  for (const k in d) if (S[k] === undefined) S[k] = d[k];
  for (const k in d.cfg) if (S.cfg[k] === undefined) S.cfg[k] = d.cfg[k];
  try { META = JSON.parse(localStorage.getItem(LS_META)) || META; } catch (e) {}
  META.u = META.u || {}; META.dirty = META.dirty || {};
}
function persist() {
  try {
    localStorage.setItem(LS_STATE, JSON.stringify(S));
    localStorage.setItem(LS_META, JSON.stringify(META));
  } catch (e) { toast('تعذر الحفظ على الجهاز'); }
}
/* مفاتيح المزامنة: core + sess_YYYY-MM + diary_YYYY-MM */
const CORE_KEYS = ['v', 'cfg', 'foods', 'recent', 'lastQty', 'templates', 'notes', 'videos', 'swaps', 'prs', 'weights', 'plan', 'skips'];
function touch(...keys) {
  const t = Date.now();
  keys.forEach(k => { META.u[k] = t; META.dirty[k] = true; });
  persist();
  Sync.schedule();
}
const touchCore = () => touch('core');
const touchSess = date => touch('sess_' + date.slice(0, 7));
const touchDiary = date => touch('diary_' + date.slice(0, 7));

function getPart(key) {
  if (key === 'core') { const o = {}; CORE_KEYS.forEach(k => o[k] = S[k]); return o; }
  const [type, month] = key.split('_');
  const src = type === 'sess' ? S.sess : S.diary; const o = {};
  for (const d in src) if (d.startsWith(month)) o[d] = src[d];
  return o;
}
function setPart(key, data) {
  if (key === 'core') { CORE_KEYS.forEach(k => { if (data[k] !== undefined) S[k] = data[k]; }); return; }
  const [type, month] = key.split('_');
  const src = type === 'sess' ? S.sess : S.diary;
  for (const d in src) if (d.startsWith(month)) delete src[d];
  Object.assign(src, data || {});
}
function allPartKeys() {
  const ks = new Set(['core']);
  Object.keys(S.sess).forEach(d => ks.add('sess_' + d.slice(0, 7)));
  Object.keys(S.diary).forEach(d => ks.add('diary_' + d.slice(0, 7)));
  return [...ks];
}

/* ================= واجهة: نوافذ وتنبيهات ================= */
let toastTimer;
function toast(msg, ms = 2400) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.remove('hide'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hide'), ms);
}
let modalCleanup = null;
function openModal(html, mount) {
  closeModal();
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog"><button class="x" data-close aria-label="إغلاق">✕</button>${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(bg);
  document.body.style.overflow = 'hidden';
  if (mount) modalCleanup = mount($('.modal', bg)) || null;
}
function closeModal() {
  if (typeof modalCleanup === 'function') { try { modalCleanup(); } catch (e) {} }
  modalCleanup = null;
  $$('.modal-bg').forEach(m => m.remove());
  document.body.style.overflow = '';
}
function confirmBox(msg, onYes, yesText = 'نعم') {
  openModal(`<h2>${esc(msg)}</h2><div class="row" style="margin-top:14px"><button class="btn-primary grow" id="cy">${esc(yesText)}</button><button class="grow" data-close>إلغاء</button></div>`,
    m => { $('#cy', m).onclick = () => { closeModal(); onYes(); }; });
}

/* ================= منطق التمرين ================= */
const e1rm = (w, r) => (w > 0 && r > 0 && r <= 15) ? w * (1 + r / 30) : null;
const programWeek = (date = today()) => Math.max(1, Math.floor(daysBetween(S.cfg.startDate, date) / 7) + 1);
const failureAllowed = (date = today()) => programWeek(date) > 2;

function slotExercise(dayKey, idx) {
  const base = PROGRAM[dayKey].ex[idx];
  const swapped = S.swaps[dayKey + ':' + idx];
  return { ...base, id: swapped || base.id, orig: base.id, swapped: !!swapped };
}
function workingSets(arr) { return (arr || []).filter(s => s.t !== 'w'); }
function sessionHasWork(sess) { return !!sess && Object.values(sess.ex || {}).some(a => workingSets(a).length > 0); }

function lastPerformance(exId, beforeDate) {
  const dates = Object.keys(S.sess).filter(d => d < beforeDate && S.sess[d].ex && workingSets(S.sess[d].ex[exId]).length).sort();
  if (!dates.length) return null;
  const d = dates[dates.length - 1];
  return { date: d, sets: workingSets(S.sess[d].ex[exId]) };
}
function topWeight(exId, beforeDate) {
  const lp = lastPerformance(exId, beforeDate);
  return lp ? Math.max(...lp.sets.map(s => s.w || 0)) : null;
}
function priorBest(exId, beforeDate) {
  let e = 0, w = 0, any = false;
  for (const d in S.sess) if (d < beforeDate) for (const s of workingSets(S.sess[d].ex?.[exId])) { any = true; e = Math.max(e, e1rm(s.w, s.r) || 0); w = Math.max(w, s.w); }
  return any ? { e1rm: e, w } : null;
}
function recomputePR(exId) {
  let best = null;
  for (const d of Object.keys(S.sess).sort()) {
    for (const s of workingSets(S.sess[d].ex?.[exId])) {
      const e = e1rm(s.w, s.r);
      if (!best) best = { e1rm: e || 0, w: s.w, r: s.r, date: d, wDate: d };
      else {
        if (e && e > best.e1rm + 1e-6) { best.e1rm = e; best.r = s.r; best.date = d; best.eW = s.w; }
        if (s.w > best.w) { best.w = s.w; best.wDate = d; }
      }
    }
  }
  if (best) S.prs[exId] = best; else delete S.prs[exId];
  return best;
}

/* حالة الأسبوع: المنجز، الفايت، المتبقي، واقتراح اليوم */
function weekInfo(date = today()) {
  const ws = weekStart(date);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const done = {};
  dates.forEach(d => { const s = S.sess[d]; if (sessionHasWork(s)) done[s.day] = d; });
  const skipped = S.skips[ws] || [];
  // الحصص اللي موعدها قبل بداية البرنامج ما تنحسب عليك
  const beforeStart = k => { const d = dates.find(x => dow(x) === PROGRAM[k].dow); return d < S.cfg.startDate; };
  const remaining = WEEK_ORDER.filter(k => !done[k] && !skipped.includes(k) && !beforeStart(k));
  const todaySess = S.sess[date];
  const todayUsed = sessionHasWork(todaySess);
  const futureTrain = dates.filter(d => d > date && isTrainDow(d)).length;
  const slotsLeft = futureTrain + (!todayUsed && isTrainDow(date) ? 1 : 0);
  const missed = dates.filter(d => d < date && d >= S.cfg.startDate && isTrainDow(d) && !sessionHasWork(S.sess[d]) && !skipped.includes(scheduledDay(d)))
    .map(d => ({ date: d, day: scheduledDay(d) })).filter(m => !done[m.day]);
  return { ws, dates, done, skipped, remaining, slotsLeft, missed, todayUsed };
}
function suggestion(date = today()) {
  const wi = weekInfo(date);
  const s = S.sess[date];
  if (s && s.day && (sessionHasWork(s) || s.start)) return { day: s.day, wi, kind: 'active' };
  if (S.plan[date]) return { day: S.plan[date], wi, kind: 'planned' };
  const overflow = wi.remaining.length - wi.slotsLeft;
  if (isTrainDow(date)) {
    if (!wi.remaining.length) return { day: null, wi, kind: 'week-done' };
    const day = wi.remaining[0];
    let drop = null;
    if (overflow > 0) drop = DROP_PRIORITY.find(k => wi.remaining.includes(k) && k !== day);
    return { day, wi, kind: day === scheduledDay(date) ? 'normal' : 'shifted', drop };
  }
  // يوم راحة
  if (wi.remaining.length && wi.remaining.length > wi.slotsLeft) return { day: null, wi, kind: 'rest-makeup', makeup: wi.remaining[0] };
  return { day: null, wi, kind: 'rest' };
}
function ensureSession(date, day) {
  if (!S.sess[date]) S.sess[date] = { day, ex: {}, start: null, end: null };
  if (!S.sess[date].day) S.sess[date].day = day;
  return S.sess[date];
}

/* ================= منطق الأكل ================= */
function allFoods() {
  const m = {};
  BASE_FOODS.forEach(f => m[f.id] = f);
  Object.values(S.foods).forEach(f => m[f.id] = f);
  return m;
}
const foodById = id => allFoods()[id];
function calc(food, qty) {
  const k = food.per === 'unit' ? qty : qty / 100;
  return { kcal: food.kcal * k, p: food.p * k, c: food.c * k, f: food.f * k };
}
const isRestDay = date => !isTrainDow(date) && !sessionHasWork(S.sess[date]);
const targetsFor = date => isRestDay(date) ? S.cfg.targets.rest : S.cfg.targets.train;
function diaryDay(date, create) {
  if (!S.diary[date] && create) S.diary[date] = { items: [], water: 0, supps: {} };
  return S.diary[date] || { items: [], water: 0, supps: {} };
}
function totals(items) {
  return items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { kcal: 0, p: 0, c: 0, f: 0 });
}
function qtyLabel(food, qty) {
  if (food.per === 'unit') return `${fmt(qty)} ${food.unit || 'حصة'}`;
  return `${fmt(qty)} ${food.unitLabel && food.unitLabel.startsWith('مل') ? 'مل' : 'جم'}`;
}
function addFoodEntry(date, meal, food, qty) {
  const d = diaryDay(date, true);
  const v = calc(food, qty);
  d.items.push({ id: uid(), fid: food.id, name: food.name, qty, per: food.per, unit: food.unit || '', meal, ts: Date.now(), ...v });
  S.lastQty[food.id] = qty;
  S.recent = [food.id, ...S.recent.filter(x => x !== food.id)].slice(0, 40);
  touchDiary(date); touchCore();
}

/* ================= الرسم: مخطط جسم وخطوط بيانية ================= */
function bodySVG(primary = [], secondary = []) {
  const col = k => primary.includes(k) ? 'var(--accent)' : secondary.includes(k) ? 'color-mix(in srgb,var(--accent) 45%,var(--card2))' : 'var(--line)';
  const e = (k, cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col(k)}"/>`;
  const rr = (k, x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${col(k)}"/>`;
  const sil = ox => `<g fill="none" stroke="var(--muted)" stroke-width="1.2" opacity=".5">
    <circle cx="${ox + 50}" cy="22" r="11"/>
    <path d="M${ox + 30} 42 Q${ox + 50} 36 ${ox + 70} 42 L${ox + 80} 60 L${ox + 90} 112 M${ox + 30} 42 L${ox + 20} 60 L${ox + 10} 112
      M${ox + 34} 46 L${ox + 34} 112 L${ox + 30} 200 M${ox + 66} 46 L${ox + 66} 112 L${ox + 70} 200 M${ox + 50} 118 L${ox + 50} 200"/></g>`;
  const front = [
    sil(0),
    e('front_delt', 25, 50, 7, 7), e('front_delt', 75, 50, 7, 7),
    e('side_delt', 19, 54, 4, 6), e('side_delt', 81, 54, 4, 6),
    e('chest', 40, 60, 10, 8), e('chest', 60, 60, 10, 8),
    e('biceps', 19, 78, 5, 11), e('biceps', 81, 78, 5, 11),
    e('forearms', 14, 102, 4, 11), e('forearms', 86, 102, 4, 11),
    rr('abs', 41, 72, 18, 36),
    e('quads', 40, 140, 9, 24), e('quads', 60, 140, 9, 24)
  ].join('');
  const ox = 105;
  const back = [
    sil(ox),
    e('rear_delt', ox + 25, 50, 7, 7), e('rear_delt', ox + 75, 50, 7, 7),
    e('upper_back', ox + 50, 56, 18, 9),
    e('lats', ox + 39, 80, 8, 16), e('lats', ox + 61, 80, 8, 16),
    e('triceps', ox + 19, 78, 5, 11), e('triceps', ox + 81, 78, 5, 11),
    rr('lower_back', ox + 43, 94, 14, 18),
    e('glutes', ox + 41, 124, 10, 9), e('glutes', ox + 59, 124, 10, 9),
    e('hams', ox + 40, 152, 8, 18), e('hams', ox + 60, 152, 8, 18),
    e('calves', ox + 39, 184, 6, 12), e('calves', ox + 61, 184, 6, 12)
  ].join('');
  return `<svg viewBox="0 0 210 210" class="chart" style="max-width:300px;margin:auto">${front}${back}
    <text x="50" y="208" font-size="9" text-anchor="middle" fill="var(--muted)">أمام</text>
    <text x="${ox + 50}" y="208" font-size="9" text-anchor="middle" fill="var(--muted)">خلف</text></svg>`;
}
/* خط بياني بسيط: series = [{pts:[{x:date,y}], color, dashed}] */
function lineChart(series, opts = {}) {
  const W = 340, H = 170, L = 34, R = 8, T = 10, B = 24;
  const all = series.flatMap(s => s.pts);
  if (new Set(all.map(p => p.x)).size < 2) return `<p class="muted small">${opts.empty || 'يحتاج بيانات أكثر لعرض الرسم.'}</p>`;
  const xs = all.map(p => pd(p.x).getTime()), ys = all.map(p => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x1 === x0) x1 = x0 + 86400000;
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad_ = (y1 - y0) * 0.15 || 1; y0 -= pad_; y1 += pad_;
  const X = t => L + (t - x0) / (x1 - x0) * (W - L - R);
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  for (let i = 0; i <= 3; i++) { const v = y0 + (y1 - y0) * i / 3; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 4}" y="${Y(v) + 3}" font-size="9" text-anchor="end" fill="var(--muted)">${fmt(v)}</text>`; }
  g += `<text x="${L}" y="${H - 6}" font-size="9" fill="var(--muted)">${dShort(ds(new Date(x0)))}</text><text x="${W - R}" y="${H - 6}" font-size="9" text-anchor="end" fill="var(--muted)">${dShort(ds(new Date(x1)))}</text>`;
  const lines = series.map(s => {
    const pts = s.pts.slice().sort((a, b) => a.x < b.x ? -1 : 1);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(pd(p.x).getTime()).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
    const dots = s.dots === false ? '' : pts.map(p => `<circle cx="${X(pd(p.x).getTime()).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.6" fill="${s.color}"/>`).join('');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dashed ? 'stroke-dasharray="4 3"' : ''} stroke-linejoin="round"/>${dots}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" style="direction:ltr">${g}${lines}</svg>`;
}

/* ================= التوجيه والعرض ================= */
const ROUTES = { home: viewHome, workout: viewWorkout, food: viewFood, progress: viewProgress, more: viewMore };
let route = 'home', routeArg = null;
function render() {
  const [r, a] = (location.hash.slice(1) || 'home').split('/');
  route = ROUTES[r] ? r : 'home'; routeArg = a || null;
  $$('#nav a').forEach(x => x.classList.toggle('on', x.dataset.r === route));
  const app = $('#app');
  app.innerHTML = ROUTES[route](routeArg);
  const bind = ROUTES[route].bind_; if (bind) bind(app, routeArg);
}
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }

function macroBar(label, val, target, unit) {
  const pct = target ? Math.min(100, val / target * 100) : 0;
  const left = target - val;
  return `<div class="macro"><div class="row between"><span>${label}</span><span><b>${fmt(val)}</b> / ${fmt(target)} ${unit}
    <span class="muted small"> · ${left >= 0 ? 'باقي ' + fmt(left) : 'زيادة ' + fmt(-left)}</span></span></div>
    <div class="bar ${val > target * 1.05 ? 'over' : ''}"><i style="width:${pct}%"></i></div></div>`;
}

/* ---------- الصفحة الرئيسية ---------- */
function viewHome() {
  const t = today(); const sg = suggestion(t); const wi = sg.wi;
  const d = diaryDay(t); const tot = totals(d.items); const tg = targetsFor(t);
  let workout = '';
  if (sg.kind === 'active') {
    const s = S.sess[t];
    workout = `<h2>تمرين اليوم: ${PROGRAM[s.day].ar}</h2><p class="muted small">${s.end ? 'خلّصت حصة اليوم ✅' : 'الحصة شغالة'}</p>
      <a class="btn btn-primary btn-block" href="#workout">${s.end ? 'عرض الحصة' : 'كمّل التمرين'}</a>`;
  } else if (sg.day) {
    const note = sg.kind === 'shifted' ? `<div class="banner warn small">فاتتك حصة ${PROGRAM[sg.day].ar} هالأسبوع، فاليوم تعوضها بدل ${PROGRAM[scheduledDay(t)].ar}.</div>` : '';
    const drop = sg.drop ? `<div class="banner warn small">الأسبوع ما يكفي لكل الحصص. اقتراح: احذف حصة <b>${PROGRAM[sg.drop].ar}</b> هالأسبوع. <button class="btn-sm btn-ghost" data-skip="${sg.drop}">احذفها</button></div>` : '';
    workout = `<h2>تمرين اليوم: ${PROGRAM[sg.day].ar}</h2>${note}${drop}
      <p class="muted small">${PROGRAM[sg.day].ex.length} تمارين · الأسبوع ${programWeek(t)} من البرنامج</p>
      <a class="btn btn-primary btn-block" href="#workout">ابدأ التمرين</a>`;
  } else if (sg.kind === 'rest-makeup') {
    workout = `<h2>يوم راحة</h2><div class="banner warn">فاتتك حصة <b>${PROGRAM[sg.makeup].ar}</b> هالأسبوع. تبي تعوضها اليوم؟</div>
      <div class="row"><button class="btn-primary grow" data-makeup="${sg.makeup}">أعوضها اليوم</button><button class="grow" data-skip="${sg.makeup}">لا، أحذفها</button></div>`;
  } else if (sg.kind === 'week-done') {
    workout = `<h2>خلّصت حصص الأسبوع كلها 💪</h2><p class="muted">اليوم راحة إضافية.</p>`;
  } else {
    workout = `<h2>يوم راحة</h2><p class="muted small">التعافي جزء من التمرين. ركز على أكلك ونومك.</p>`;
  }
  const weekDots = WEEK_ORDER.map(k => `<span class="chip ${wi.done[k] ? 'on' : ''}">${wi.done[k] ? '✓ ' : ''}${PROGRAM[k].short}</span>`).join('');
  const isSat = dow(t) === 6;
  const wt = S.weights[t];
  return `<h1>${dLabel(t)}</h1>
  ${isSat ? `<div class="banner good row between"><span>تقريرك الأسبوعي جاهز 📊</span><button class="btn-sm btn-primary" data-report>افتحه</button></div>` : ''}
  <div class="card">${workout}<div class="chips" style="margin-top:12px">${weekDots}</div></div>
  <div class="card"><div class="row between"><h2>أكل اليوم</h2><a href="#food" class="small">التفاصيل ←</a></div>
    <p class="muted small" style="margin-top:-6px">${isRestDay(t) ? 'أهداف يوم الراحة' : 'أهداف يوم التمرين'}</p>
    ${macroBar('السعرات', tot.kcal, tg.kcal, '')}${macroBar('البروتين', tot.p, tg.p, 'جم')}
    <div class="row" style="margin-top:6px"><span class="grow">💧 الماي: <b>${fmt((d.water || 0) / 1000)}</b> / ${fmt(S.cfg.waterGoal / 1000)} لتر</span>
    <button class="btn-sm" data-water="250">+ كوب</button></div></div>
  <div class="card"><h2>وزن اليوم</h2>
    <div class="row"><input id="hw" inputmode="decimal" placeholder="مثلاً 55.4" value="${wt ?? ''}"><button class="btn-primary" id="hws">حفظ</button></div>
    <p class="muted small" style="margin:6px 0 0">الأفضل الصبح على الريق بعد الحمام.</p></div>`;
}
viewHome.bind_ = app => {
  const t = today();
  $$('[data-skip]', app).forEach(b => b.onclick = () => {
    const ws = weekStart(t); S.skips[ws] = [...new Set([...(S.skips[ws] || []), b.dataset.skip])]; touchCore(); rerender(); toast('تم حذف الحصة من هالأسبوع');
  });
  $$('[data-makeup]', app).forEach(b => b.onclick = () => { S.plan[t] = b.dataset.makeup; touchCore(); location.hash = '#workout'; });
  $$('[data-water]', app).forEach(b => b.onclick = () => { const d = diaryDay(t, true); d.water = (d.water || 0) + 250; touchDiary(t); rerender(); });
  const rb = $('[data-report]', app); if (rb) rb.onclick = () => showReport(addDays(weekStart(t), -7));
  $('#hws', app).onclick = () => { const v = num($('#hw', app).value); if (!v || v < 25 || v > 250) return toast('اكتب وزن صحيح'); S.weights[t] = v; touchCore(); toast('تم حفظ الوزن'); };
};

/* ---------- التمرين ---------- */
function viewWorkout(arg) {
  const t = today();
  const sg = suggestion(t);
  const s = S.sess[t];
  const day = (arg && PROGRAM[arg]) ? arg : (s?.day || sg.day || sg.makeup || scheduledDay(t) || 'upper');
  const P = PROGRAM[day];
  const wk = programWeek(t);
  const chips = WEEK_ORDER.map(k => `<a href="#workout/${k}" class="chip ${k === day ? 'on' : ''}">${sg.wi.done[k] ? '✓ ' : ''}${PROGRAM[k].short}</a>`).join('');
  const conflict = s && s.day && s.day !== day && sessionHasWork(s);
  const phase = wk <= 2
    ? `<div class="banner warn small"><b>الأسبوع ${wk}: مرحلة تعود.</b> كل المجموعات تخلي فيها 2-3 تكرارات احتياط، وبدون فشل أبداً.</div>`
    : `<div class="banner small">الأسبوع ${wk}: المركبة 1-2 احتياط. وآخر مجموعة في تمارين العزل (عليها <span class="tag f" style="display:inline">فشل</span>) تكمل فيها لين ما تقدر تسوي تكرار نظيف.</div>`;
  let timer = '';
  if (s && s.start && s.day === day) {
    const end = s.end || Date.now();
    timer = `<div class="row between small"><span class="muted">مدة الحصة: <b id="dur">${Math.round((end - s.start) / 60000)}</b> دقيقة</span>${s.end ? '<span class="done-mark">منتهية ✓</span>' : ''}</div>`;
  }
  const cards = P.ex.map((_, i) => exerciseCard(day, i, t)).join('');
  return `<h1>${P.ar}</h1>
    <div class="scroll-x" style="margin-bottom:10px">${chips}</div>
    ${conflict ? `<div class="banner warn small">سجلت اليوم حصة ${PROGRAM[s.day].ar}. اللي تسجله هنا بينضاف لنفس حصة اليوم.</div>` : ''}
    ${phase}${timer}
    ${cards}
    <button class="btn-primary btn-block" id="finish" style="margin:6px 0 20px">${s?.end && s.day === day ? 'ملخص الحصة' : 'إنهاء الحصة'}</button>`;
}
function exerciseCard(day, idx, date) {
  const slot = slotExercise(day, idx); const ex = EXERCISES[slot.id];
  const s = S.sess[date]; const logged = s?.ex?.[slot.id] || [];
  const work = workingSets(logged);
  const lp = lastPerformance(slot.id, date);
  const fail = failureAllowed(date);
  const rest = ex.kind === 'c' ? 'راحة 2-3 د' : 'راحة 1-2 د';
  const pr = S.prs[slot.id];
  let warm = '';
  if (slot.warm) {
    const W = topWeight(slot.id, date);
    let sug = [];
    if (W) {
      if (ex.bar && W > 30) sug.push([20, 10]);
      sug.push([round25(W * 0.5), ex.bar ? 6 : 8], [round25(W * 0.75), ex.bar ? 3 : 4]);
    }
    warm = `<div class="last"><b>إحماء:</b> ${W ? sug.map(([w, r]) => `<button class="btn-sm btn-ghost" data-warm="${slot.id}" data-w="${w}" data-r="${r}">${w}×${r}</button>`).join(' ') + ' <span class="tiny">(اضغط لتسجيلها)</span>'
      : '2-3 مجموعات خفيفة تصعد فيها تدريجياً قبل وزن العمل. سجلها بنوع «إحماء».'}</div>`;
  }
  const rows = [];
  logged.forEach((st, k) => {
    const e = e1rm(st.w, st.r);
    rows.push(`<div class="set logged" data-edit="${slot.id}" data-k="${k}"><span class="n">${st.t === 'w' ? 'إ' : workingSets(logged.slice(0, k + 1)).length}</span>
      <span class="tag ${st.t}">${st.t === 'w' ? 'إحماء' : st.t === 'f' ? 'فشل' : 'عادية'}</span>
      <span class="val">${fmt(st.w)} كجم</span><span class="val">${st.r} ×</span>
      <span class="tiny muted" style="text-align:center">${st.pr ? '<span class="pr">🏆</span>' : e ? fmt(e) : ''}</span></div>`);
  });
  const remain = Math.max(0, slot.sets - work.length);
  const prevSets = lp ? lp.sets : [];
  for (let k = 0; k < remain; k++) {
    const setNo = work.length + k + 1;
    const isLast = setNo === slot.sets;
    const tp = (ex.kind === 'i' && isLast && fail) ? 'f' : 'n';
    const pv = work[work.length - 1] || prevSets[setNo - 1] || prevSets[prevSets.length - 1];
    rows.push(`<div class="set" data-row="${slot.id}"><span class="n">${setNo}</span>
      <span class="tag ${tp}" data-type="${tp}">${tp === 'f' ? 'فشل' : 'عادية'}</span>
      <input inputmode="decimal" placeholder="${pv ? fmt(pv.w) : 'الوزن'}" aria-label="الوزن">
      <input inputmode="numeric" placeholder="${pv ? pv.r : slot.reps}" aria-label="التكرار">
      <button class="ok" data-save="${slot.id}" aria-label="حفظ">✓</button></div>`);
  }
  const hdr = `<div class="row between tiny muted" style="margin-top:8px"><span style="width:34px;text-align:center">#</span><span style="width:64px">النوع</span><span class="grow" style="text-align:center">الوزن</span><span class="grow" style="text-align:center">التكرار</span><span style="width:44px"></span></div>`;
  return `<div class="card" id="ex-${idx}">
    <div class="ex-head"><div><div class="ex-title">${idx + 1}. ${esc(ex.ar)}</div><div class="en">${esc(ex.en)}</div>
      <div class="chips" style="margin-top:6px">${ex.m.slice(0, 2).map(m => `<span class="chip">${MUSCLES[m].ar}</span>`).join('')}${slot.swapped ? '<span class="chip" style="color:var(--warn)">بديل</span>' : ''}</div></div>
      <div style="text-align:left;white-space:nowrap"><b>${slot.sets} × ${slot.reps}</b><div class="tiny muted">${rest}</div>${work.length >= slot.sets ? '<div class="done-mark small">تم ✓</div>' : ''}</div></div>
    <div class="ex-tools">
      <button class="btn-sm" data-video="${slot.id}">🎥 الشرح</button>
      <button class="btn-sm" data-info="${slot.id}">ℹ️ الأداء</button>
      <button class="btn-sm" data-alt="${day}:${idx}">⇄ بديل</button>
      <button class="btn-sm" data-note="${slot.id}">📝 ملاحظة</button>
    </div>
    ${S.notes[slot.id] ? `<div class="note">📝 ${esc(S.notes[slot.id])}</div>` : ''}
    ${lp ? `<div class="last">آخر مرة (${dShort(lp.date)}): ${lp.sets.map(x => `${fmt(x.w)}×${x.r}`).join('، ')}</div>` : ''}
    ${pr ? `<div class="tiny muted" style="margin-top:4px">🏆 أفضل قوة مقدّرة: ${fmt(pr.e1rm)} كجم · أثقل وزن: ${fmt(pr.w)} كجم</div>` : ''}
    ${warm}${hdr}${rows.join('')}
    <button class="btn-sm btn-ghost" style="margin-top:8px" data-extra="${slot.id}">+ مجموعة</button>
  </div>`;
}
viewWorkout.bind_ = (app, arg) => {
  const t = today();
  const s0 = S.sess[t]; const sg = suggestion(t);
  const day = (arg && PROGRAM[arg]) ? arg : (s0?.day || sg.day || sg.makeup || scheduledDay(t) || 'upper');
  const logSet = (exId, w, r, tp) => {
    const s = ensureSession(t, day);
    if (!s.start) s.start = Date.now();
    s.end = null;
    s.ex[exId] = s.ex[exId] || [];
    const set = { w, r, t: tp, ts: Date.now() };
    s.ex[exId].push(set);
    if (tp !== 'w') {
      recomputePR(exId);
      const prior = priorBest(exId, t);
      const e = e1rm(w, r) || 0;
      if (prior && (e > prior.e1rm + 1e-6 || w > prior.w)) {
        set.pr = true;
        if (!(s.prs || []).includes(exId)) { s.prs = [...(s.prs || []), exId]; toast('🏆 رقم قياسي جديد في ' + EXERCISES[exId].ar + '!', 3200); }
      }
    }
    if (S.plan[t]) { delete S.plan[t]; }
    touchSess(t); touchCore(); rerender();
  };
  $$('[data-save]', app).forEach(b => b.onclick = () => {
    const row = b.closest('.set'); const [wi, ri] = $$('input', row);
    const w = num(wi.value || wi.placeholder); const r = parseInt(ri.value || (/^\d+$/.test(ri.placeholder) ? ri.placeholder : ''), 10);
    if (w == null || w < 0 || !r || r < 1) return toast('اكتب الوزن والتكرار');
    logSet(b.dataset.save, w, r, $('.tag', row).dataset.type);
  });
  $$('.set [data-type]', app).forEach(tg => tg.onclick = () => {
    const order = ['n', 'f', 'w']; const cur = tg.dataset.type; const nx = order[(order.indexOf(cur) + 1) % 3];
    tg.dataset.type = nx; tg.className = 'tag ' + nx; tg.textContent = nx === 'w' ? 'إحماء' : nx === 'f' ? 'فشل' : 'عادية';
  });
  $$('[data-warm]', app).forEach(b => b.onclick = () => logSet(b.dataset.warm, +b.dataset.w, +b.dataset.r, 'w'));
  $$('[data-extra]', app).forEach(b => b.onclick = () => setEditor(t, day, b.dataset.extra, null));
  $$('[data-edit]', app).forEach(el => el.onclick = () => setEditor(t, day, el.dataset.edit, +el.dataset.k));
  $$('[data-video]', app).forEach(b => b.onclick = () => showVideo(b.dataset.video));
  $$('[data-info]', app).forEach(b => b.onclick = () => showInfo(b.dataset.info));
  $$('[data-alt]', app).forEach(b => b.onclick = () => showAlts(b.dataset.alt));
  $$('[data-note]', app).forEach(b => b.onclick = () => editNote(b.dataset.note));
  $('#finish', app).onclick = () => {
    const s = S.sess[t];
    if (!sessionHasWork(s)) return toast('ما سجلت أي مجموعة للحين');
    if (!s.end) { s.end = Date.now(); touchSess(t); }
    showSummary(t);
  };
  const durEl = $('#dur', app);
  if (durEl && s0 && s0.start && !s0.end) {
    const iv = setInterval(() => { if (!document.body.contains(durEl)) return clearInterval(iv); durEl.textContent = Math.round((Date.now() - s0.start) / 60000); }, 30000);
  }
};
function setEditor(date, day, exId, k) {
  const cur = S.sess[date];
  const st = k == null ? { w: '', r: '', t: 'n' } : cur.ex[exId][k];
  openModal(`<h2>${k == null ? 'مجموعة إضافية' : 'تعديل المجموعة'}</h2><p class="muted small">${esc(EXERCISES[exId].ar)}</p>
    <div class="row"><div class="grow"><label>الوزن (كجم)</label><input id="ew" inputmode="decimal" value="${st.w}"></div>
    <div class="grow"><label>التكرار</label><input id="er" inputmode="numeric" value="${st.r}"></div></div>
    <label>النوع</label><select id="et"><option value="n">عادية</option><option value="f">فشل</option><option value="w">إحماء</option></select>
    <div class="row" style="margin-top:14px"><button class="btn-primary grow" id="es">حفظ</button>${k != null ? '<button class="btn-danger grow" id="ed">حذف</button>' : ''}</div>`,
    m => {
      $('#et', m).value = st.t;
      $('#es', m).onclick = () => {
        const w = num($('#ew', m).value), r = parseInt($('#er', m).value, 10);
        if (w == null || !r) return toast('اكتب الوزن والتكرار');
        const obj = { w, r, t: $('#et', m).value, ts: st.ts || Date.now() };
        const s = ensureSession(date, day); s.ex[exId] = s.ex[exId] || [];
        if (k == null) { s.ex[exId].push(obj); if (!s.start) s.start = Date.now(); } else s.ex[exId][k] = obj;
        recomputePR(exId); touchSess(date); touchCore(); closeModal(); rerender();
      };
      const del = $('#ed', m); if (del) del.onclick = () => {
        const s = S.sess[date]; s.ex[exId].splice(k, 1); if (!s.ex[exId].length) delete s.ex[exId];
        recomputePR(exId); touchSess(date); touchCore(); closeModal(); rerender();
      };
    });
}
function showSummary(date) {
  const s = S.sess[date]; let sets = 0, vol = 0, exN = 0;
  Object.values(s.ex).forEach(a => { const w = workingSets(a); if (w.length) exN++; sets += w.length; w.forEach(x => vol += x.w * x.r); });
  const first = Math.min(...Object.values(s.ex).flat().map(x => x.ts || s.start));
  const last = Math.max(...Object.values(s.ex).flat().map(x => x.ts || s.end));
  const mins = Math.max(1, Math.round((last - first) / 60000));
  const prs = (s.prs || []).map(id => `<li>🏆 ${esc(EXERCISES[id].ar)}</li>`).join('');
  openModal(`<h2>ملخص الحصة: ${PROGRAM[s.day].ar}</h2>
    <div class="kpi"><div><span class="muted small">المدة</span><b>${mins} د</b></div><div><span class="muted small">التمارين</span><b>${exN}</b></div>
    <div><span class="muted small">مجموعات العمل</span><b>${sets}</b></div><div><span class="muted small">الحجم الإجمالي</span><b>${fmt(vol)} كجم</b></div></div>
    ${mins > 80 ? '<p class="small" style="color:var(--warn)">الحصة طولت عن الساعة وربع. راقب الراحة بين المجموعات.</p>' : ''}
    <h3 style="margin-top:14px">الأرقام القياسية</h3>${prs ? `<ul>${prs}</ul>` : '<p class="muted small">ما فيه أرقام قياسية هالمرة، المهم الاستمرار.</p>'}
    <button class="btn-primary btn-block" data-close style="margin-top:10px">تمام</button>`);
}
function ytId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/); return m ? m[1] : null;
}
function showVideo(exId) {
  const ex = EXERCISES[exId];
  const url = S.videos[exId] || ex.video || '';
  const id = ytId(url);
  const qAr = encodeURIComponent(`${ex.ar} طريقة الأداء الصحيح`);
  const qEn = encodeURIComponent(`${ex.en} proper form`);
  openModal(`<h2>${esc(ex.ar)}</h2><div class="en" style="margin-bottom:10px">${esc(ex.en)}</div>
    ${id ? `<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
      <a class="btn btn-ghost btn-block" style="margin-top:8px" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${id}">افتح في يوتيوب</a>`
      : `<div class="banner small">ما فيه مقطع مثبت لهذا التمرين للحين. ابحث، وإذا عجبك مقطع انسخ رابطه وثبّته تحت.</div>`}
    <div class="row" style="margin-top:8px"><a class="btn grow" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${qAr}">بحث بالعربي</a>
    <a class="btn grow" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${qEn}">بحث بالإنجليزي</a></div>
    <label>رابط مقطع تثبّته لهذا التمرين</label><div class="row"><input id="vu" placeholder="https://youtu.be/..." value="${esc(S.videos[exId] || '')}" style="direction:ltr"><button class="btn-primary" id="vs">ثبّت</button></div>
    ${S.videos[exId] ? '<button class="btn-sm btn-ghost btn-danger" id="vr" style="margin-top:8px">إلغاء التثبيت</button>' : ''}
    <h3 style="margin-top:14px">نقاط الأداء</h3><ul>${ex.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`,
    m => {
      $('#vs', m).onclick = () => { const v = $('#vu', m).value.trim(); if (!ytId(v)) return toast('الرابط لازم يكون من يوتيوب'); S.videos[exId] = v; touchCore(); showVideo(exId); toast('تم تثبيت المقطع'); };
      const rm = $('#vr', m); if (rm) rm.onclick = () => { delete S.videos[exId]; touchCore(); showVideo(exId); };
    });
}
function showInfo(exId) {
  const ex = EXERCISES[exId];
  openModal(`<h2>${esc(ex.ar)}</h2><div class="en">${esc(ex.en)}</div>
    <div style="margin:12px 0">${bodySVG([ex.m[0]], ex.m.slice(1))}</div>
    <div class="chips">${ex.m.map((m, i) => `<span class="chip ${i === 0 ? 'on' : ''}">${MUSCLES[m].ar} <span class="en">${MUSCLES[m].en}</span></span>`).join('')}</div>
    <p class="tiny muted">الأخضر الغامق: العضلة الأساسية · الفاتح: عضلات مساعدة</p>
    <h3>نقاط الأداء الصحيح</h3><ul>${ex.cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    <p class="small muted">${ex.kind === 'c' ? 'تمرين مركب: مجموعات عادية، خلّ 1-2 تكرار احتياط ولا توصل للفشل.' : 'تمرين عزل: آخر مجموعة تقدر توصل فيها للفشل (بعد أول أسبوعين).'}</p>
    <button class="btn btn-block" data-close>تمام</button>`);
}
function showAlts(key) {
  const [day, idx] = key.split(':'); const base = PROGRAM[day].ex[+idx];
  const cur = S.swaps[key] || base.id;
  const opts = [base.id, ...EXERCISES[base.id].alts].filter((v, i, a) => a.indexOf(v) === i);
  openModal(`<h2>اختر بديل</h2><p class="muted small">نفس الحركة ونفس العضلات. اختيارك ينحفظ لهذا التمرين في الحصص الجاية.</p>
    ${opts.map(id => `<div class="pick" data-pick="${id}"><div><b>${esc(EXERCISES[id].ar)}</b>${id === base.id ? ' <span class="chip">الأصلي</span>' : ''}<div class="en">${esc(EXERCISES[id].en)}</div></div>${id === cur ? '<span class="done-mark">✓</span>' : ''}</div>`).join('')}`,
    m => $$('[data-pick]', m).forEach(p => p.onclick = () => {
      if (p.dataset.pick === base.id) delete S.swaps[key]; else S.swaps[key] = p.dataset.pick;
      touchCore(); closeModal(); rerender();
    }));
}
function editNote(exId) {
  openModal(`<h2>ملاحظة: ${esc(EXERCISES[exId].ar)}</h2><p class="muted small">مثل: المقعد على رقم 4، قبضة أوسع من الكتف بشبر</p>
    <textarea id="nt" style="direction:rtl;text-align:right;font-size:15px">${esc(S.notes[exId] || '')}</textarea>
    <button class="btn-primary btn-block" id="ns" style="margin-top:10px">حفظ</button>`,
    m => $('#ns', m).onclick = () => { const v = $('#nt', m).value.trim(); if (v) S.notes[exId] = v; else delete S.notes[exId]; touchCore(); closeModal(); rerender(); });
}

/* ---------- الأكل ---------- */
let foodDate = null;
function viewFood(arg) {
  const t = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : today();
  foodDate = t;
  const d = diaryDay(t); const tot = totals(d.items); const tg = targetsFor(t);
  const meals = MEALS.map(ml => {
    const its = d.items.filter(i => i.meal === ml.id); const mt = totals(its);
    return `<div class="card"><div class="row between"><h3>${ml.ar} <span class="muted small">${its.length ? `${fmt(mt.kcal)} سعرة · ${fmt(mt.p)} بروتين` : ''}</span></h3>
      <div class="row">${its.length ? `<button class="btn-sm btn-ghost" data-savetpl="${ml.id}" title="احفظها كوجبة جاهزة">⭐</button>` : ''}<button class="btn-sm btn-primary" data-add="${ml.id}">+ أضف</button></div></div>
      ${its.map(i => `<div class="item" data-item="${i.id}"><div><div class="nm">${esc(i.name)}</div><div class="tiny muted">${i.per === 'unit' ? fmt(i.qty) + ' ' + esc(i.unit || 'حصة') : fmt(i.qty) + ' جم'}</div></div>
        <div style="text-align:left" class="small"><b>${fmt(i.kcal)}</b> سعرة<div class="tiny muted">ب ${fmt(i.p)} · ك ${fmt(i.c)} · د ${fmt(i.f)}</div></div></div>`).join('')}
    </div>`;
  }).join('');
  // اقتراحات
  const remP = tg.p - tot.p, remK = tg.kcal - tot.kcal;
  let sugg = '';
  if (remP >= 15) {
    const pool = [...new Set([...S.recent, ...Object.keys(S.foods), ...BASE_FOODS.map(f => f.id)])].map(foodById).filter(Boolean)
      .filter(f => f.kcal > 0 && f.p / f.kcal >= 0.07);
    const scored = pool.map(f => {
      const pPer = f.per === 'unit' ? f.p : f.p / 100; const kPer = f.per === 'unit' ? f.kcal : f.kcal / 100;
      let q = remP / pPer; if (remK > 0) q = Math.min(q, remK / kPer);
      if (f.per === 'unit') q = Math.max(1, Math.round(q)); else q = Math.max(25, Math.round(q / 25) * 25);
      if (f.per === 'unit' && q > 6) q = 6; if (f.per === 'g' && q > 400) q = 400;
      const v = calc(f, q); return { f, q, v, score: (S.recent.includes(f.id) ? 2 : 0) + f.p / f.kcal * 10 };
    }).sort((a, b) => b.score - a.score).slice(0, 3);
    sugg = `<div class="card"><h3>باقي لك ${fmt(remP)} جم بروتين — اقتراحات</h3>
      ${scored.map(x => `<div class="item"><div><div class="nm">${esc(x.f.name)}</div><div class="tiny muted">${qtyLabel(x.f, x.q)} → ${fmt(x.v.p)} بروتين · ${fmt(x.v.kcal)} سعرة</div></div>
        <button class="btn-sm" data-quick="${x.f.id}" data-q="${x.q}">+ سناك</button></div>`).join('')}</div>`;
  }
  // توزيع البروتين
  const byMeal = MEALS.map(ml => ({ ml, p: totals(d.items.filter(i => i.meal === ml.id)).p }));
  const maxP = Math.max(40, ...byMeal.map(x => x.p));
  const heavy = tot.p >= 50 && byMeal.find(x => x.p / tot.p >= 0.6);
  const dist = d.items.length ? `<div class="card"><h3>توزيع البروتين على الوجبات</h3>
    ${byMeal.map(x => `<div class="row small" style="margin:6px 0"><span style="width:52px">${x.ml.ar}</span><div class="bar grow"><i style="width:${x.p / maxP * 100}%;background:${x.p >= 25 ? 'var(--accent)' : 'var(--blue)'}"></i></div><span style="width:48px;text-align:left">${fmt(x.p)} جم</span></div>`).join('')}
    <p class="tiny muted">الأفضل 25-40 جم بروتين في كل وجبة رئيسية.${heavy ? ` <b style="color:var(--warn)">أغلب بروتينك في ${heavy.ml.ar}، حاول تقسمه.</b>` : ''}</p></div>` : '';
  const supps = S.cfg.supps.length ? `<div class="card"><h3>المكملات</h3><div class="chips">${S.cfg.supps.map(s => `<button class="chip ${d.supps?.[s.id] ? 'on' : ''}" data-supp="${s.id}">${d.supps?.[s.id] ? '✓ ' : ''}${esc(s.name)}</button>`).join('')}</div></div>` : '';
  const water = d.water || 0;
  return `<div class="row between"><button class="btn-sm" data-day="-1">→</button><h1 style="margin:8px 0">${t === today() ? 'اليوم' : dLabel(t)}</h1><button class="btn-sm" data-day="1">←</button></div>
  <div class="card"><p class="muted small" style="margin-top:0">${isRestDay(t) ? 'يوم راحة' : 'يوم تمرين'} · هدف ${fmt(tg.kcal)} سعرة</p>
    ${macroBar('السعرات', tot.kcal, tg.kcal, '')}${macroBar('البروتين', tot.p, tg.p, 'جم')}${macroBar('الكارب', tot.c, tg.c, 'جم')}${macroBar('الدهون', tot.f, tg.f, 'جم')}
    <div class="row wrap" style="margin-top:4px"><button class="btn-sm btn-ghost" id="copyY">نسخ أكل أمس</button><button class="btn-sm btn-ghost" id="tpls">⭐ وجباتي الجاهزة</button></div></div>
  ${meals}${sugg}${dist}
  <div class="card"><div class="row between"><h3>💧 الماي</h3><span><b>${fmt(water / 1000)}</b> / ${fmt(S.cfg.waterGoal / 1000)} لتر</span></div>
    <div class="bar" style="margin:6px 0 10px"><i style="width:${Math.min(100, water / S.cfg.waterGoal * 100)}%;background:var(--blue)"></i></div>
    <div class="row"><button class="grow" data-w="-250">− كوب</button><button class="grow" data-w="250">+ كوب (250)</button><button class="grow" data-w="500">+ قارورة (500)</button></div></div>
  ${supps}`;
}
viewFood.bind_ = (app) => {
  const t = foodDate;
  $$('[data-day]', app).forEach(b => b.onclick = () => { const nd = addDays(t, +b.dataset.day); if (nd > today()) return; location.hash = '#food/' + nd; });
  $$('[data-add]', app).forEach(b => b.onclick = () => addFoodModal(t, b.dataset.add));
  $$('[data-item]', app).forEach(el => el.onclick = () => editEntry(t, el.dataset.item));
  $$('[data-quick]', app).forEach(b => b.onclick = () => { const f = foodById(b.dataset.quick); addFoodEntry(t, 'snack', f, +b.dataset.q); rerender(); toast('أضيف ' + f.name); });
  $$('[data-w]', app).forEach(b => b.onclick = () => { const d = diaryDay(t, true); d.water = Math.max(0, (d.water || 0) + +b.dataset.w); touchDiary(t); rerender(); });
  $$('[data-supp]', app).forEach(b => b.onclick = () => { const d = diaryDay(t, true); d.supps = d.supps || {}; d.supps[b.dataset.supp] = !d.supps[b.dataset.supp]; touchDiary(t); rerender(); });
  $$('[data-savetpl]', app).forEach(b => b.onclick = () => saveTemplate(t, b.dataset.savetpl));
  $('#tpls', app).onclick = () => templatesModal(t, null);
  $('#copyY', app).onclick = () => {
    const y = diaryDay(addDays(t, -1));
    if (!y.items.length) return toast('ما فيه أكل مسجل أمس');
    confirmBox(`تنسخ ${y.items.length} أكلات من أمس لهذا اليوم؟`, () => {
      const d = diaryDay(t, true);
      y.items.forEach(i => d.items.push({ ...i, id: uid(), ts: Date.now() }));
      touchDiary(t); rerender(); toast('تم النسخ');
    }, 'انسخ');
  };
};
function editEntry(date, id) {
  const d = diaryDay(date); const it = d.items.find(i => i.id === id); if (!it) return;
  const food = foodById(it.fid) || { id: it.fid, name: it.name, per: it.per, unit: it.unit, kcal: it.kcal / (it.per === 'unit' ? it.qty : it.qty / 100), p: it.p / (it.per === 'unit' ? it.qty : it.qty / 100), c: it.c / (it.per === 'unit' ? it.qty : it.qty / 100), f: it.f / (it.per === 'unit' ? it.qty : it.qty / 100) };
  openModal(`<h2>${esc(it.name)}</h2>
    <label>الكمية (${food.per === 'unit' ? esc(food.unit || 'حصة') : 'جم'})</label><input id="q" inputmode="decimal" value="${it.qty}">
    <label>الوجبة</label><select id="ml">${MEALS.map(m => `<option value="${m.id}" ${m.id === it.meal ? 'selected' : ''}>${m.ar}</option>`).join('')}</select>
    <div class="row" style="margin-top:14px"><button class="btn-primary grow" id="s">حفظ</button><button class="btn-danger grow" id="del">حذف</button></div>`,
    m => {
      $('#s', m).onclick = () => { const q = num($('#q', m).value); if (!q) return; Object.assign(it, calc(food, q), { qty: q, meal: $('#ml', m).value }); touchDiary(date); closeModal(); rerender(); };
      $('#del', m).onclick = () => { d.items = d.items.filter(i => i.id !== id); touchDiary(date); closeModal(); rerender(); };
    });
}
function saveTemplate(date, meal) {
  const its = diaryDay(date).items.filter(i => i.meal === meal);
  openModal(`<h2>احفظ كوجبة جاهزة</h2><p class="muted small">${its.map(i => esc(i.name)).join('، ')}</p>
    <label>اسم الوجبة</label><input id="tn" placeholder="مثلاً: فطوري المعتاد">
    <button class="btn-primary btn-block" id="ts" style="margin-top:12px">حفظ</button>`,
    m => $('#ts', m).onclick = () => {
      const n = $('#tn', m).value.trim(); if (!n) return toast('اكتب اسم');
      const id = 't_' + uid(); S.templates[id] = { id, name: n, items: its.map(i => ({ fid: i.fid, qty: i.qty })) };
      touchCore(); closeModal(); toast('تم حفظ الوجبة');
    });
}
function templatesModal(date, meal) {
  const list = Object.values(S.templates);
  openModal(`<h2>وجباتي الجاهزة</h2>
    ${list.length ? '' : '<p class="muted">ما عندك وجبات محفوظة. سجل وجبة، واضغط ⭐ جنبها عشان تحفظها.</p>'}
    ${list.map(tp => {
      const v = totals(tp.items.map(x => { const f = foodById(x.fid); return f ? calc(f, x.qty) : { kcal: 0, p: 0, c: 0, f: 0 }; }));
      return `<div class="pick"><div data-usetpl="${tp.id}" class="grow"><b>${esc(tp.name)}</b><div class="tiny muted">${tp.items.length} أكلات · ${fmt(v.kcal)} سعرة · ${fmt(v.p)} بروتين</div></div><button class="btn-sm btn-ghost btn-danger" data-deltpl="${tp.id}">حذف</button></div>`;
    }).join('')}
    ${list.length ? `<label>تنضاف لوجبة</label><select id="tm">${MEALS.map(m => `<option value="${m.id}" ${m.id === meal ? 'selected' : ''}>${m.ar}</option>`).join('')}</select>` : ''}`,
    m => {
      $$('[data-usetpl]', m).forEach(el => el.onclick = () => {
        const tp = S.templates[el.dataset.usetpl]; const ml = $('#tm', m).value;
        tp.items.forEach(x => { const f = foodById(x.fid); if (f) addFoodEntry(date, ml, f, x.qty); });
        closeModal(); rerender(); toast('أضيفت ' + tp.name);
      });
      $$('[data-deltpl]', m).forEach(b => b.onclick = () => { delete S.templates[b.dataset.deltpl]; touchCore(); templatesModal(date, meal); });
    });
}
function addFoodModal(date, meal, tab = 'search', prefill = null) {
  const tabs = [['search', 'بحث'], ['scan', 'باركود'], ['new', 'جديد'], ['tpl', 'وجباتي']];
  let body = '';
  if (tab === 'search') {
    body = `<input id="fq" placeholder="ابحث: رز، دجاج، بيض..." autocomplete="off"><div class="list-pick" id="fl" style="margin-top:8px"></div>`;
  } else if (tab === 'scan') {
    body = `<div id="reader"></div><p class="muted small" id="scanMsg">وجّه الكاميرا على الباركود...</p>
      <label>أو اكتب رقم الباركود</label><div class="row"><input id="bc" inputmode="numeric" style="direction:ltr"><button class="btn-primary" id="bcs">بحث</button></div>`;
  } else if (tab === 'new') {
    const p = prefill || {};
    body = `${p.barcode ? `<p class="tiny muted">باركود: <span class="en">${esc(p.barcode)}</span>${p.fromOFF ? ' · القيم من Open Food Facts، راجعها مع الملصق' : ''}</p>` : ''}
      <label>الاسم</label><input id="nn" value="${esc(p.name || '')}" placeholder="مثلاً: وجبة صجي دجاج مع رز">
      <label>القيم الغذائية لكل</label><select id="nper"><option value="g">100 جرام</option><option value="unit">حبة / حصة / علبة</option></select>
      <div id="unitBox" class="${p.per === 'unit' ? '' : 'hide'}"><label>اسم الوحدة</label><input id="nunit" value="${esc(p.unit || 'حصة')}"></div>
      <div class="row"><div class="grow"><label>سعرات</label><input id="nk" inputmode="decimal" value="${p.kcal ?? ''}"></div><div class="grow"><label>بروتين</label><input id="np" inputmode="decimal" value="${p.p ?? ''}"></div></div>
      <div class="row"><div class="grow"><label>كارب</label><input id="nc" inputmode="decimal" value="${p.c ?? ''}"></div><div class="grow"><label>دهون</label><input id="nf" inputmode="decimal" value="${p.f ?? ''}"></div></div>
      <label>وزن الحصة بالجرام (اختياري)</label><input id="ng" inputmode="decimal" value="${p.grams ?? ''}" placeholder="مثلاً 170 لعلبة زبادي">
      <button class="btn-primary btn-block" id="nsave" style="margin-top:12px">احفظ وكمّل</button>`;
  } else {
    closeModal(); return templatesModal(date, meal);
  }
  openModal(`<h2>أضف لـ ${MEALS.find(m => m.id === meal).ar}</h2>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>${body}`,
    m => {
      $$('[data-tab]', m).forEach(b => b.onclick = () => addFoodModal(date, meal, b.dataset.tab));
      if (tab === 'search') {
        const all = Object.values(allFoods());
        const draw = q => {
          q = q.trim();
          let list;
          if (!q) list = [...S.recent.map(foodById).filter(Boolean), ...all.filter(f => !S.recent.includes(f.id))];
          else list = all.filter(f => f.name.includes(q) || (f.barcode || '').includes(q));
          $('#fl', m).innerHTML = (list.length ? list.slice(0, 60).map(f => `<div class="pick" data-f="${f.id}"><div><b>${esc(f.name)}</b><div class="tiny muted">${f.per === 'unit' ? 'لكل ' + esc(f.unit || 'حصة') : 'لكل 100 جم'}: ${fmt(f.kcal)} سعرة · ب ${fmt(f.p)}</div></div>${S.recent.includes(f.id) ? '<span class="tiny muted">مؤخراً</span>' : ''}</div>`).join('')
            : `<p class="muted small">ما لقيت "${esc(q)}". جرب تبويب «جديد» وأضفه.</p>`);
          $$('[data-f]', m).forEach(el => el.onclick = () => qtyModal(date, meal, foodById(el.dataset.f)));
        };
        $('#fq', m).oninput = e => draw(e.target.value); draw('');
      }
      if (tab === 'new') {
        const p = prefill || {};
        $('#nper', m).value = p.per || 'g';
        $('#nper', m).onchange = e => $('#unitBox', m).classList.toggle('hide', e.target.value !== 'unit');
        $('#nsave', m).onclick = () => {
          const f = { id: 'c_' + uid(), name: $('#nn', m).value.trim(), per: $('#nper', m).value, kcal: num($('#nk', m).value), p: num($('#np', m).value) || 0, c: num($('#nc', m).value) || 0, f: num($('#nf', m).value) || 0 };
          if (!f.name || f.kcal == null) return toast('الاسم والسعرات مطلوبة');
          if (f.per === 'unit') f.unit = $('#nunit', m).value.trim() || 'حصة';
          const g = num($('#ng', m).value); if (g) f.grams = g;
          if (p.barcode) f.barcode = p.barcode;
          S.foods[f.id] = f; touchCore(); qtyModal(date, meal, f);
        };
      }
      if (tab === 'scan') return startScanner(m, code => lookupBarcode(date, meal, code));
    });
}
let scannerLib = null;
function loadScript(src) {
  return new Promise((res, rej) => { if ($(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
}
function startScanner(m, onCode) {
  let qr = null, stopped = false, handled = false;
  const msg = t => { const el = $('#scanMsg', m); if (el) el.textContent = t; };
  const done = code => { if (handled) return; handled = true; stop(); onCode(code); };
  const stop = () => { stopped = true; if (qr) { qr.stop().catch(() => {}).finally(() => { try { qr.clear(); } catch (e) {} }); qr = null; } };
  $('#bcs', m).onclick = () => { const v = $('#bc', m).value.trim(); if (v) done(v); };
  (async () => {
    try {
      await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
      if (stopped) return;
      const F = window.Html5QrcodeSupportedFormats;
      qr = new window.Html5Qrcode('reader', { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128], verbose: false });
      await qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } }, text => done(text), () => {});
      if (stopped) stop();
    } catch (e) {
      msg('ما قدرت أشغل الكاميرا. تأكد إنك سمحت للمتصفح يستخدمها، أو اكتب رقم الباركود تحت.');
    }
  })();
  return stop;
}
async function lookupBarcode(date, meal, code) {
  const mine = Object.values(S.foods).find(f => f.barcode === code);
  if (mine) return qtyModal(date, meal, mine);
  openModal(`<h2>أبحث عن المنتج...</h2><p class="muted en">${esc(code)}</p>`);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ar,brands,nutriments,serving_quantity`);
    const j = await r.json();
    if (j.status !== 1 || !j.product) throw new Error('nf');
    const p = j.product, n = p.nutriments || {};
    let kcal = n['energy-kcal_100g']; if (kcal == null && n['energy_100g'] != null) kcal = n['energy_100g'] / 4.184;
    const name = [p.product_name_ar || p.product_name, p.brands ? '(' + p.brands.split(',')[0] + ')' : ''].filter(Boolean).join(' ');
    addFoodModal(date, meal, 'new', { barcode: code, fromOFF: true, name, per: 'g', kcal: kcal != null ? r1(kcal) : '', p: r1(n.proteins_100g ?? 0), c: r1(n.carbohydrates_100g ?? 0), f: r1(n.fat_100g ?? 0), grams: p.serving_quantity ? r1(+p.serving_quantity) : '' });
    if (kcal == null) toast('المنتج موجود بس بدون سعرات، اكتبها من الملصق');
  } catch (e) {
    addFoodModal(date, meal, 'new', { barcode: code });
    toast(navigator.onLine ? 'المنتج مو موجود بالقاعدة. أدخله من الملصق مرة وحدة وينحفظ' : 'ما فيه نت. أدخل القيم من الملصق', 3500);
  }
}
function qtyModal(date, meal, food) {
  const last = S.lastQty[food.id];
  const def = last || (food.per === 'unit' ? 1 : (food.grams || 100));
  const u = food.per === 'unit' ? (food.unit || 'حصة') : (food.unitLabel && food.unitLabel.startsWith('مل') ? 'مل' : 'جم');
  const quick = food.per === 'unit' ? [0.5, 1, 2, 3] : [food.grams, 50, 100, 150, 200].filter((v, i, a) => v && a.indexOf(v) === i);
  openModal(`<h2>${esc(food.name)}</h2><p class="muted small">${food.per === 'unit' ? 'لكل ' + esc(u) : 'لكل 100 ' + u}: ${fmt(food.kcal)} سعرة · ب ${fmt(food.p)} · ك ${fmt(food.c)} · د ${fmt(food.f)}</p>
    <label>الكمية (${esc(u)})</label><input id="q" inputmode="decimal" value="${def}">
    <div class="chips" style="margin-top:8px">${quick.map(v => `<button class="chip" data-q="${v}">${fmt(v)}${food.per !== 'unit' && v === food.grams ? ' (حصة)' : ''}</button>`).join('')}</div>
    <div class="kpi" style="margin-top:12px" id="pv"></div>
    <label>الوجبة</label><select id="ml">${MEALS.map(m => `<option value="${m.id}" ${m.id === meal ? 'selected' : ''}>${m.ar}</option>`).join('')}</select>
    <button class="btn-primary btn-block" id="add" style="margin-top:12px">أضف</button>
    ${food.id.startsWith('c_') ? '<button class="btn-sm btn-ghost btn-block" id="editf" style="margin-top:8px">تعديل قيم هذا الأكل</button>' : ''}`,
    m => {
      const upd = () => { const q = num($('#q', m).value) || 0; const v = calc(food, q); $('#pv', m).innerHTML = `<div><span class="muted small">سعرات</span><b>${fmt(v.kcal)}</b></div><div><span class="muted small">بروتين</span><b>${fmt(v.p)}</b></div><div><span class="muted small">كارب</span><b>${fmt(v.c)}</b></div><div><span class="muted small">دهون</span><b>${fmt(v.f)}</b></div>`; };
      $('#q', m).oninput = upd; upd();
      $$('[data-q]', m).forEach(b => b.onclick = () => { $('#q', m).value = b.dataset.q; upd(); });
      $('#add', m).onclick = () => { const q = num($('#q', m).value); if (!q || q <= 0) return toast('اكتب الكمية'); addFoodEntry(date, $('#ml', m).value, food, q); closeModal(); rerender(); toast('تمت الإضافة'); };
      const ef = $('#editf', m); if (ef) ef.onclick = () => editFoodModal(date, meal, food);
    });
}
function editFoodModal(date, meal, food) {
  openModal(`<h2>تعديل: ${esc(food.name)}</h2>
    <label>الاسم</label><input id="nn" value="${esc(food.name)}">
    <p class="tiny muted">القيم ${food.per === 'unit' ? 'لكل ' + esc(food.unit || 'حصة') : 'لكل 100 جم'}</p>
    <div class="row"><div class="grow"><label>سعرات</label><input id="nk" inputmode="decimal" value="${food.kcal}"></div><div class="grow"><label>بروتين</label><input id="np" inputmode="decimal" value="${food.p}"></div></div>
    <div class="row"><div class="grow"><label>كارب</label><input id="nc" inputmode="decimal" value="${food.c}"></div><div class="grow"><label>دهون</label><input id="nf" inputmode="decimal" value="${food.f}"></div></div>
    <div class="row" style="margin-top:12px"><button class="btn-primary grow" id="s">حفظ</button><button class="btn-danger grow" id="d">حذف من أكلاتي</button></div>`,
    m => {
      $('#s', m).onclick = () => { Object.assign(food, { name: $('#nn', m).value.trim() || food.name, kcal: num($('#nk', m).value) ?? food.kcal, p: num($('#np', m).value) ?? 0, c: num($('#nc', m).value) ?? 0, f: num($('#nf', m).value) ?? 0 }); S.foods[food.id] = food; touchCore(); qtyModal(date, meal, food); };
      $('#d', m).onclick = () => confirmBox('تحذف هذا الأكل من قائمتك؟ (السجلات القديمة تبقى)', () => { delete S.foods[food.id]; S.recent = S.recent.filter(x => x !== food.id); touchCore(); toast('تم الحذف'); });
    });
}

/* ---------- التقدم ---------- */
let progExercise = null, calMonth = null;
function weightStats() {
  const ds_ = Object.keys(S.weights).sort();
  const avgRange = (end, n) => { const v = []; for (let i = 0; i < n; i++) { const d = addDays(end, -i); if (S.weights[d] != null) v.push(S.weights[d]); } return v.length ? v.reduce((a, b) => a + b) / v.length : null; };
  const t = today();
  const a1 = avgRange(t, 7), a0 = avgRange(addDays(t, -7), 7);
  const span = ds_.length ? daysBetween(ds_[0], t) : 0;
  return { ds: ds_, a1, a0, span, monthly: (a1 != null && a0 != null) ? (a1 - a0) * 4.3 : null, avgRange };
}
function viewProgress() {
  const ws = weightStats();
  const pts = ws.ds.map(d => ({ x: d, y: S.weights[d] }));
  const avgPts = ws.ds.map(d => ({ x: d, y: ws.avgRange(d, 7) }));
  let guide = '<p class="muted small">سجّل وزنك 3 مرات بالأسبوع على الأقل. بعد أسبوعين يعطيك التطبيق توصية على السعرات.</p>';
  if (ws.span >= 13 && ws.monthly != null) {
    const mth = ws.monthly;
    if (mth < 0.3) guide = `<div class="banner warn small">معدل الزيادة <b>${fmt(mth)} كجم/شهر</b>، أبطأ من الهدف (0.5-1). <b>زِد 150 سعرة</b> من الكارب.<button class="btn-sm btn-primary" style="margin-top:6px;display:block" data-adj="150">طبّق: +150 سعرة</button></div>`;
    else if (mth > 1.2) guide = `<div class="banner warn small">معدل الزيادة <b>${fmt(mth)} كجم/شهر</b>، أسرع من الهدف. <b>نقّص 150 سعرة</b>.<button class="btn-sm btn-primary" style="margin-top:6px;display:block" data-adj="-150">طبّق: −150 سعرة</button></div>`;
    else guide = `<div class="banner good small">معدل الزيادة <b>${fmt(mth)} كجم/شهر</b>، ضمن الهدف. كمّل على نفس الأكل 👌</div>`;
  }
  // القوة
  const exWithData = Object.keys(S.prs).filter(id => EXERCISES[id]);
  if (!progExercise || !exWithData.includes(progExercise)) progExercise = exWithData[0] || null;
  let strength = '<p class="muted small">أول ما تسجل تمارينك، يطلع لك هنا تطور قوتك لكل تمرين.</p>';
  if (progExercise) {
    const pts2 = Object.keys(S.sess).sort().map(d => { const best = Math.max(0, ...workingSets(S.sess[d].ex?.[progExercise]).map(s => e1rm(s.w, s.r) || 0)); return best ? { x: d, y: r1(best) } : null; }).filter(Boolean);
    strength = `<select id="pex">${exWithData.map(id => `<option value="${id}" ${id === progExercise ? 'selected' : ''}>${esc(EXERCISES[id].ar)}</option>`).join('')}</select>
      <div style="margin-top:10px">${lineChart([{ pts: pts2, color: 'var(--accent)' }], { empty: 'يحتاج حصتين على الأقل لهذا التمرين.' })}</div>
      <p class="tiny muted">الخط = القوة المقدّرة (أقصى وزن لمرة وحدة تقديرياً) في كل حصة. الوزن × (1 + التكرار ÷ 30).</p>`;
  }
  const prRows = exWithData.sort((a, b) => (S.prs[b].date || '').localeCompare(S.prs[a].date || '')).map(id => { const p = S.prs[id]; return `<tr><td>${esc(EXERCISES[id].ar)}</td><td><b>${fmt(p.e1rm)}</b></td><td>${fmt(p.w)}</td><td class="tiny">${dShort(p.date)}</td></tr>`; }).join('');
  return `<h1>التقدم</h1>
    <div class="card"><div class="row between"><h2>الوزن</h2><span class="small muted">${ws.a1 != null ? 'متوسط 7 أيام: <b>' + fmt(ws.a1) + '</b> كجم' : ''}</span></div>
      <div class="row"><input id="wd" type="date" value="${today()}" max="${today()}" style="max-width:48%"><input id="wv" inputmode="decimal" placeholder="الوزن"><button class="btn-primary" id="wsave">حفظ</button></div>
      <div style="margin-top:10px">${lineChart([{ pts, color: 'var(--muted)', width: 1.2 }, { pts: avgPts, color: 'var(--accent)', dots: false, width: 2.5 }], { empty: 'سجّل وزنك يومين أو أكثر لعرض الرسم.' })}</div>
      <p class="tiny muted">النقاط: الوزن اليومي · الخط الأخضر: المتوسط الأسبوعي (هو اللي نحكم عليه)</p>${guide}</div>
    <div class="card"><h2>تطور القوة</h2>${strength}</div>
    ${prRows ? `<div class="card"><h2>🏆 الأرقام القياسية</h2><table><tr><th>التمرين</th><th>قوة مقدّرة</th><th>أثقل وزن</th><th>التاريخ</th></tr>${prRows}</table></div>` : ''}
    <div class="card">${calendarHTML()}</div>
    <button class="btn-block" id="rep" style="margin-bottom:14px">📊 التقرير الأسبوعي</button>`;
}
function calendarHTML() {
  const base = calMonth || today().slice(0, 7);
  const [y, mo] = base.split('-').map(Number);
  const first = new Date(y, mo - 1, 1); const n = new Date(y, mo, 0).getDate();
  const lead = (first.getDay() - 6 + 7) % 7; // يبدأ السبت
  const t = today();
  let cells = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'].map(h => `<div class="h">${h}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div></div>';
  for (let dd = 1; dd <= n; dd++) {
    const d = `${y}-${pad(mo)}-${pad(dd)}`;
    let cls = 'd';
    if (sessionHasWork(S.sess[d])) cls += ' done';
    else if (!isTrainDow(d)) cls += ' rest';
    else if (d < t && d >= S.cfg.startDate) cls += ' miss';
    if (d === t) cls += ' today';
    cells += `<div class="${cls}">${dd}</div>`;
  }
  // الالتزام: أسابيع متتالية فيها 4 حصص أو أكثر
  let streak = 0; let w = addDays(weekStart(t), -7);
  while (w >= weekStart(S.cfg.startDate)) {
    const cnt = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter(d => sessionHasWork(S.sess[d])).length;
    if (cnt >= 4) { streak++; w = addDays(w, -7); } else break;
  }
  const thisWeek = Object.keys(weekInfo(t).done).length;
  return `<div class="row between"><h2>تقويم الالتزام</h2><div class="row"><button class="btn-sm" data-cal="-1">→</button><b class="small">${MONTH_AR[mo - 1]} ${y}</b><button class="btn-sm" data-cal="1">←</button></div></div>
    <div class="kpi" style="margin-bottom:10px"><div><span class="muted small">هالأسبوع</span><b>${thisWeek} / 5</b></div><div><span class="muted small">أسابيع ملتزم فيها ورا بعض</span><b>${streak} 🔥</b></div></div>
    <div class="cal">${cells}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>تمرنت</span><span><i style="background:color-mix(in srgb,var(--bad) 35%,var(--card2))"></i>فاتت</span><span><i style="background:var(--card2);opacity:.5"></i>راحة</span></div>`;
}
viewProgress.bind_ = app => {
  $('#wsave', app).onclick = () => { const d = $('#wd', app).value || today(); const v = num($('#wv', app).value); if (!v || v < 25 || v > 250) return toast('اكتب وزن صحيح'); S.weights[d] = v; touchCore(); rerender(); toast('تم الحفظ'); };
  const pex = $('#pex', app); if (pex) pex.onchange = e => { progExercise = e.target.value; rerender(); };
  $$('[data-cal]', app).forEach(b => b.onclick = () => { const base = calMonth || today().slice(0, 7); const [y, m] = base.split('-').map(Number); const d = new Date(y, m - 1 + +b.dataset.cal, 1); calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; rerender(); });
  $$('[data-adj]', app).forEach(b => b.onclick = () => {
    const k = +b.dataset.adj; const cg = r0(k / 4);
    ['train', 'rest'].forEach(x => { S.cfg.targets[x].kcal += k; S.cfg.targets[x].c = Math.max(0, S.cfg.targets[x].c + cg); });
    touchCore(); toast(`تم: ${k > 0 ? '+' : ''}${k} سعرة (${cg > 0 ? '+' : ''}${cg} جم كارب)`); rerender();
  });
  $('#rep', app).onclick = () => showReport(dow(today()) === 6 ? addDays(weekStart(today()), -7) : weekStart(today()));
};
function showReport(ws) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const sessions = dates.filter(d => sessionHasWork(S.sess[d])).map(d => ({ d, day: S.sess[d].day }));
  const logged = dates.filter(d => (S.diary[d]?.items || []).length);
  const avg = k => logged.length ? logged.reduce((a, d) => a + totals(S.diary[d].items)[k], 0) / logged.length : null;
  const tgAvg = logged.length ? logged.reduce((a, d) => a + targetsFor(d).kcal, 0) / logged.length : null;
  const pHit = logged.filter(d => totals(S.diary[d].items).p >= targetsFor(d).p * 0.9).length;
  const water = dates.map(d => S.diary[d]?.water || 0).filter(Boolean);
  const wv = dates.map(d => S.weights[d]).filter(v => v != null);
  const wPrev = Array.from({ length: 7 }, (_, i) => S.weights[addDays(ws, -7 + i)]).filter(v => v != null);
  const wa = wv.length ? wv.reduce((a, b) => a + b) / wv.length : null, wp = wPrev.length ? wPrev.reduce((a, b) => a + b) / wPrev.length : null;
  const prs = sessions.flatMap(s => (S.sess[s.d].prs || []).map(id => EXERCISES[id]?.ar)).filter(Boolean);
  const tips = [];
  if (sessions.length < 4) tips.push('حاول توصل 4-5 حصص بالأسبوع. لو فاتتك حصة، عوّضها يوم الجمعة أو الأحد.');
  if (logged.length && avg('p') < S.cfg.targets.train.p * 0.85) tips.push('البروتين أقل من هدفك. أضف مصدر بروتين لكل وجبة.');
  if (logged.length && tgAvg && avg('kcal') < tgAvg * 0.9) tips.push('السعرات أقل من هدفك، وهذا يبطّئ زيادة العضل.');
  if (logged.length < 5) tips.push('سجّل أكلك كل يوم عشان تكون الأرقام دقيقة.');
  if (!tips.length) tips.push('أسبوع ممتاز، كمّل على نفس المستوى 👏');
  openModal(`<h2>التقرير الأسبوعي</h2><p class="muted small">${dLabel(ws)} → ${dLabel(addDays(ws, 6))}</p>
    <div class="kpi">
      <div><span class="muted small">الحصص</span><b>${sessions.length} / 5</b></div>
      <div><span class="muted small">أرقام قياسية</span><b>${prs.length}</b></div>
      <div><span class="muted small">متوسط السعرات</span><b>${avg('kcal') != null ? fmt(avg('kcal')) : '—'}</b><span class="tiny muted">${tgAvg ? 'الهدف ' + fmt(tgAvg) : ''}</span></div>
      <div><span class="muted small">متوسط البروتين</span><b>${avg('p') != null ? fmt(avg('p')) + ' جم' : '—'}</b><span class="tiny muted">${logged.length ? 'حققته ' + pHit + ' من ' + logged.length + ' أيام' : ''}</span></div>
      <div><span class="muted small">متوسط الوزن</span><b>${wa != null ? fmt(wa) : '—'}</b><span class="tiny muted">${wa != null && wp != null ? (wa - wp >= 0 ? '+' : '') + fmt(wa - wp) + ' عن الأسبوع اللي قبله' : ''}</span></div>
      <div><span class="muted small">متوسط الماي</span><b>${water.length ? fmt(water.reduce((a, b) => a + b) / water.length / 1000) + ' لتر' : '—'}</b></div>
    </div>
    ${sessions.length ? `<p class="small" style="margin-top:12px">الحصص: ${sessions.map(s => PROGRAM[s.day]?.short).join('، ')}</p>` : ''}
    ${prs.length ? `<p class="small">🏆 ${[...new Set(prs)].join('، ')}</p>` : ''}
    <h3 style="margin-top:12px">ملاحظات</h3><ul>${tips.map(x => `<li class="small">${x}</li>`).join('')}</ul>
    <div class="row"><button class="grow" id="prevW">→ الأسبوع السابق</button><button class="grow" id="nextW">الأسبوع التالي ←</button></div>`,
    m => { $('#prevW', m).onclick = () => showReport(addDays(ws, -7)); $('#nextW', m).onclick = () => { const n = addDays(ws, 7); if (n <= today()) showReport(n); }; });
}

/* ---------- الإعدادات ---------- */
function viewMore() {
  const T = S.cfg.targets;
  const tgt = (k, l) => `<h3 style="margin-top:10px">${l}</h3><div class="row">${[['kcal', 'سعرات'], ['p', 'بروتين'], ['c', 'كارب'], ['f', 'دهون']].map(([x, n]) => `<div class="grow"><label>${n}</label><input inputmode="decimal" data-t="${k}.${x}" value="${T[k][x]}"></div>`).join('')}</div>`;
  const fb = S.cfg.fb;
  return `<h1>الإعدادات</h1>
  <div class="card"><h2>أهداف الأكل</h2>${tgt('train', 'أيام التمرين')}${tgt('rest', 'أيام الراحة (الجمعة والأحد)')}
    <p class="tiny muted">سعرات الماكروز تقريباً: بروتين×4 + كارب×4 + دهون×9 = <span id="calc"></span></p>
    <label>هدف الماي اليومي (مل)</label><input id="wg" inputmode="numeric" value="${S.cfg.waterGoal}">
    <button class="btn-primary btn-block" id="tsave" style="margin-top:12px">حفظ الأهداف</button></div>
  <div class="card"><h2>البرنامج</h2><label>تاريخ بداية البرنامج (يحدد أسبوع التعود)</label><input type="date" id="sd" value="${S.cfg.startDate}">
    <button class="btn btn-block" id="sdsave" style="margin-top:10px">حفظ</button>
    ${Object.keys(S.swaps).length ? `<button class="btn-sm btn-ghost btn-block" id="rsw" style="margin-top:8px">رجّع كل التمارين للأصلية (${Object.keys(S.swaps).length} بدائل)</button>` : ''}</div>
  <div class="card"><h2>المكملات</h2><div class="chips" id="sl">${S.cfg.supps.map(s => `<span class="chip">${esc(s.name)} <button class="btn-sm" style="padding:0 6px" data-rs="${s.id}">✕</button></span>`).join('')}</div>
    <div class="row" style="margin-top:8px"><input id="sn" placeholder="اسم مكمل"><button id="sa">إضافة</button></div></div>
  <div class="card"><h2>المزامنة (Firebase)</h2>
    <p class="small muted" id="syncStat">${Sync.statusText()}</p>
    ${fb ? `${Sync.user ? `<p class="small">مسجل باسم: <span class="en">${esc(Sync.user.email || '')}</span></p><div class="row"><button class="grow btn-primary" id="snow">مزامنة الآن</button><button class="grow" id="sout">تسجيل خروج</button></div>`
      : `<label>الإيميل</label><input id="fe" type="email" style="direction:ltr"><label>كلمة المرور</label><input id="fp" type="password" style="direction:ltr">
         <div class="row" style="margin-top:10px"><button class="btn-primary grow" id="fin">دخول</button><button class="grow" id="fup">حساب جديد</button></div>`}
      <button class="btn-sm btn-ghost btn-block btn-danger" id="fbrm" style="margin-top:10px">إزالة إعداد Firebase</button>`
    : `<p class="small">الصق إعداد مشروع Firebase (firebaseConfig) — تقدر تستخدم نفس مشروع ميزانيتي.</p>
      <textarea id="fbc" placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'></textarea>
      <button class="btn-primary btn-block" id="fbs" style="margin-top:8px">حفظ وتشغيل</button>`}
    <details style="margin-top:10px"><summary class="small">قواعد الأمان المطلوبة في Firestore</summary>
      <pre class="tiny" style="direction:ltr;text-align:left;white-space:pre-wrap;background:var(--card2);padding:8px;border-radius:8px">match /users/{uid}/fitapp/{doc} {
  allow read, write: if request.auth != null
    && request.auth.uid == uid;
}</pre><p class="tiny muted">تنضاف داخل <span class="en">match /databases/{database}/documents</span>، مع تفعيل الدخول بالإيميل وكلمة المرور في Authentication.</p></details></div>
  <div class="card"><h2>النسخ الاحتياطي</h2>
    <div class="row wrap"><button class="grow" id="exj">تصدير نسخة (JSON)</button><button class="grow" id="exc">تصدير التمارين (CSV)</button></div>
    <label>استيراد نسخة</label><input type="file" id="imp" accept="application/json,.json"></div>
  <p class="tiny muted" style="text-align:center">تمريني · الإصدار ${APP_VERSION}</p>`;
}
viewMore.bind_ = app => {
  const upd = () => { const v = k => num($(`[data-t="train.${k}"]`, app).value) || 0; $('#calc', app).textContent = fmt(v('p') * 4 + v('c') * 4 + v('f') * 9) + ' سعرة (يوم تمرين)'; };
  $$('[data-t]', app).forEach(i => i.oninput = upd); upd();
  $('#tsave', app).onclick = () => {
    $$('[data-t]', app).forEach(i => { const [k, x] = i.dataset.t.split('.'); const v = num(i.value); if (v != null) S.cfg.targets[k][x] = v; });
    const wg = num($('#wg', app).value); if (wg) S.cfg.waterGoal = wg;
    touchCore(); toast('تم حفظ الأهداف');
  };
  $('#sdsave', app).onclick = () => { const v = $('#sd', app).value; if (v) { S.cfg.startDate = v; touchCore(); toast('تم'); } };
  const rsw = $('#rsw', app); if (rsw) rsw.onclick = () => confirmBox('ترجع كل التمارين للأصلية؟', () => { S.swaps = {}; touchCore(); rerender(); });
  $$('[data-rs]', app).forEach(b => b.onclick = () => { S.cfg.supps = S.cfg.supps.filter(s => s.id !== b.dataset.rs); touchCore(); rerender(); });
  $('#sa', app).onclick = () => { const n = $('#sn', app).value.trim(); if (!n) return; S.cfg.supps.push({ id: 's_' + uid(), name: n }); touchCore(); rerender(); };
  $('#exj', app).onclick = () => download(`tamreeni-backup-${today()}.json`, JSON.stringify(S, null, 1), 'application/json');
  $('#exc', app).onclick = () => {
    const lines = ['date,day,exercise_ar,exercise_en,set_type,weight_kg,reps,e1rm'];
    Object.keys(S.sess).sort().forEach(d => { const s = S.sess[d]; Object.entries(s.ex || {}).forEach(([id, arr]) => arr.forEach(x => lines.push([d, s.day, EXERCISES[id]?.ar || id, EXERCISES[id]?.en || id, x.t, x.w, x.r, fmt(e1rm(x.w, x.r) || '')].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')))); });
    download(`tamreeni-workouts-${today()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  };
  $('#imp', app).onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => {
      try { const o = JSON.parse(rd.result); if (!o.cfg || !o.sess) throw 0; confirmBox('تستبدل كل بياناتك الحالية بالنسخة هذي؟', () => { S = o; load2(); allPartKeys().forEach(k => { META.u[k] = Date.now(); META.dirty[k] = true; }); persist(); Sync.schedule(); toast('تم الاستيراد'); render(); }, 'استبدل'); }
      catch (err) { toast('الملف غير صالح'); }
    }; rd.readAsText(f);
  };
  const fbs = $('#fbs', app); if (fbs) fbs.onclick = () => {
    const txt = $('#fbc', app).value.trim();
    try {
      let cfg = null;
      try { cfg = JSON.parse(txt.replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch (e) {
        cfg = {}; const re = /(\w+)\s*:\s*["'`]([^"'`]*)["'`]/g; let mm;
        while ((mm = re.exec(txt))) cfg[mm[1]] = mm[2];
      }
      if (!cfg.apiKey || !cfg.projectId) throw 0;
      S.cfg.fb = cfg; touchCore(); Sync.init().then(rerender); toast('تم حفظ الإعداد');
    } catch (e) { toast('الإعداد غير صحيح. انسخه كامل من Firebase'); }
  };
  const fin = $('#fin', app); if (fin) fin.onclick = () => Sync.signIn($('#fe', app).value, $('#fp', app).value, false);
  const fup = $('#fup', app); if (fup) fup.onclick = () => Sync.signIn($('#fe', app).value, $('#fp', app).value, true);
  const snow = $('#snow', app); if (snow) snow.onclick = () => Sync.full(true);
  const sout = $('#sout', app); if (sout) sout.onclick = () => Sync.signOut();
  const fbrm = $('#fbrm', app); if (fbrm) fbrm.onclick = () => confirmBox('تشيل إعداد المزامنة؟ بياناتك تبقى على الجهاز.', () => { S.cfg.fb = null; touchCore(); location.reload(); });
};
function load2() { const d = defaultState(); for (const k in d) if (S[k] === undefined) S[k] = d[k]; for (const k in d.cfg) if (S.cfg[k] === undefined) S.cfg[k] = d.cfg[k]; }
function download(name, text, type) {
  const blob = new Blob([text], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ================= المزامنة مع Firebase ================= */
const Sync = {
  app: null, db: null, auth: null, user: null, timer: null, busy: false, lastOk: null, err: null,
  statusText() {
    if (!S.cfg.fb) return 'غير مفعّلة. بياناتك محفوظة على هذا الجهاز فقط.';
    if (this.err) return '⚠️ ' + this.err;
    if (!this.user) return 'سجّل دخول عشان تتزامن بياناتك بين أجهزتك.';
    return this.lastOk ? 'آخر مزامنة: ' + new Date(this.lastOk).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'متصل.';
  },
  async init() {
    if (!S.cfg.fb || this.app) return;
    try {
      const V = '10.12.2';
      await loadScript(`https://www.gstatic.com/firebasejs/${V}/firebase-app-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${V}/firebase-auth-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore-compat.js`);
      this.app = firebase.apps.find(a => a.name === 'fitapp') || firebase.initializeApp(S.cfg.fb, 'fitapp');
      this.auth = this.app.auth(); this.db = this.app.firestore();
      this.auth.onAuthStateChanged(u => { this.user = u; this.err = null; if (u) this.full(); if (route === 'more') rerender(); });
    } catch (e) { this.err = 'تعذر تحميل Firebase (تحتاج نت أول مرة).'; }
  },
  async signIn(email, pass, create) {
    if (!this.auth) await this.init();
    if (!this.auth) return toast(this.err || 'المزامنة غير جاهزة');
    try {
      if (create) await this.auth.createUserWithEmailAndPassword(email.trim(), pass);
      else await this.auth.signInWithEmailAndPassword(email.trim(), pass);
      toast('تم الدخول');
    } catch (e) { toast('فشل الدخول: ' + (e.code || '').replace('auth/', ''), 3500); }
  },
  async signOut() { if (this.auth) await this.auth.signOut(); this.user = null; rerender(); },
  col() { return this.db.collection('users').doc(this.user.uid).collection('fitapp'); },
  schedule() { if (!this.user) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 2000); },
  async push() {
    if (!this.user || !navigator.onLine) return;
    const keys = Object.keys(META.dirty).filter(k => META.dirty[k]);
    if (!keys.length) return;
    try {
      const batch = this.db.batch();
      keys.forEach(k => batch.set(this.col().doc(k), { d: JSON.stringify(getPart(k)), u: META.u[k] || Date.now() }));
      await batch.commit();
      keys.forEach(k => delete META.dirty[k]); persist(); this.lastOk = Date.now(); this.err = null;
    } catch (e) { this.err = 'فشل الرفع: ' + (e.code || e.message); }
  },
  async pull() {
    const snap = await this.col().get(); let changed = false;
    snap.forEach(doc => {
      const r = doc.data(); const k = doc.id;
      if ((r.u || 0) > (META.u[k] || 0)) {
        try { setPart(k, JSON.parse(r.d)); META.u[k] = r.u; delete META.dirty[k]; changed = true; } catch (e) {}
      }
    });
    if (changed) { load2(); persist(); }
    return changed;
  },
  async full(manual) {
    if (!this.user || this.busy) return; this.busy = true;
    try {
      const changed = await this.pull();
      // أي جزء محلي أحدث من السحابة يرفع
      await this.push();
      this.lastOk = Date.now(); this.err = null;
      if (changed && !$('.modal-bg')) rerender();
      if (manual) toast('تمت المزامنة');
    } catch (e) { this.err = 'فشلت المزامنة: ' + (e.code || e.message); if (manual) toast(this.err, 3500); }
    this.busy = false;
    if (route === 'more' && !$('.modal-bg')) rerender();
  }
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { Sync.full(); if (route === 'home') rerender(); } });
window.addEventListener('online', () => Sync.full());

/* ================= البداية ================= */
load();
// أول مرة: علّم كل الأجزاء للرفع لما تتفعل المزامنة
if (!Object.keys(META.u).length) { allPartKeys().forEach(k => { META.u[k] = 1; META.dirty[k] = true; }); persist(); }
render();
Sync.init();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
