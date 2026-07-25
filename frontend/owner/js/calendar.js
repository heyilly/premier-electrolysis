// ── CALENDAR STATE ────────────────────────────────────────────────────────────
let currentView = 'month';
let currentDate = new Date();

// ── TITLE ─────────────────────────────────────────────────────────────────────
function getCalTitle() {
  if (currentView === 'day') {
    return currentDate.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
  } else if (currentView === 'week') {
    const start = getWeekStart(currentDate);
    const end   = new Date(start); end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
  }
  return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
}

function updateTitle() {
  document.getElementById('cal-title').textContent = getCalTitle();
}

// ── VIEW SWITCHING ────────────────────────────────────────────────────────────
function setView(v) {
  currentView = v;
  ['day','week','month'].forEach(vv => document.getElementById(`vbtn-${vv}`).classList.toggle('active', vv === v));
  updateTitle();
  renderCalendar();
}

function navPrev() {
  if (currentView === 'day')   currentDate.setDate(currentDate.getDate() - 1);
  else if (currentView === 'week') currentDate.setDate(currentDate.getDate() - 7);
  else currentDate.setMonth(currentDate.getMonth() - 1);
  updateTitle(); renderCalendar();
}

function navNext() {
  if (currentView === 'day')   currentDate.setDate(currentDate.getDate() + 1);
  else if (currentView === 'week') currentDate.setDate(currentDate.getDate() + 7);
  else currentDate.setMonth(currentDate.getMonth() + 1);
  updateTitle(); renderCalendar();
}

function goToday() {
  currentDate = new Date();
  updateTitle(); renderCalendar();
}

function getWeekStart(d) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

// ── FETCH BOOKINGS ────────────────────────────────────────────────────────────
async function getBookingsForRange(start, end) {
  const s = toDateStr(start.getFullYear(), start.getMonth() + 1, start.getDate());
  const e = toDateStr(end.getFullYear(),   end.getMonth()   + 1, end.getDate());
  try {
    const r = await fetch(`${API}/bookings?date_from=${s}&date_to=${e}`, { headers: H() });
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (err) { return []; }
}

// ── MAIN RENDER ───────────────────────────────────────────────────────────────
async function renderCalendar() {
  updateTitle();
  if (currentView === 'month')     await renderMonth();
  else if (currentView === 'week') await renderWeek();
  else                              await renderDay();
}

// ── MONTH VIEW ────────────────────────────────────────────────────────────────
async function renderMonth() {
  const body = document.getElementById('cal-body');
  const y = currentDate.getFullYear(), m = currentDate.getMonth();
  const firstDay    = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays    = new Date(y, m, 0).getDate();
  const today       = new Date();

  const bookings = await getBookingsForRange(new Date(y, m, 1), new Date(y, m, daysInMonth));

  let html = `<div class="month-grid" style="grid-template-rows:auto repeat(6,1fr)">`;
  DAYS_SHORT.forEach(d => html += `<div class="month-hdr">${d}</div>`);

  // leading prev-month cells
  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="month-cell other"><div class="month-date">${prevDays - i}</div></div>`;
  }

  // current month cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr   = toDateStr(y, m + 1, d);
    const isToday   = today.getDate() === d && today.getMonth() === m && today.getFullYear() === y;
    const dayBookings = bookings.filter(b => b.date === dateStr);

    html += `<div class="month-cell${isToday ? ' today-cell' : ''}" onclick="drillToDay(${y},${m},${d})">`;
    html += `<div class="month-date">${d}</div>`;
    dayBookings.slice(0, 3).forEach(b => {
      const t = b.start_time.slice(0, 5);
      html += `<div class="month-event ev-${b.status}" title="${b.client_name||''} · ${b.service_name}">${t} ${(b.client_name||'').split(' ')[0]}</div>`;
    });
    if (dayBookings.length > 3) html += `<div style="font-size:9px;color:var(--stone)">+${dayBookings.length - 3} more</div>`;
    html += `</div>`;
  }

  // trailing cells
  const trailing = 42 - firstDay - daysInMonth;
  for (let d = 1; d <= trailing; d++) {
    html += `<div class="month-cell other"><div class="month-date">${d}</div></div>`;
  }
  html += `</div>`;
  body.innerHTML = html;
}

function drillToDay(y, m, d) {
  currentDate = new Date(y, m, d);
  setView('day');
}

// ── DAY VIEW ──────────────────────────────────────────────────────────────────
async function renderDay() {
  const body    = document.getElementById('cal-body');
  const bookings = await getBookingsForRange(currentDate, currentDate);
  const dateStr  = toDateStr(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());

  const START_HOUR = 7, HOURS = 14, HOUR_H = 60;

  let html = `<div style="position:relative;height:${HOURS * HOUR_H}px;padding-left:56px;min-height:100%">`;

  for (let h = 0; h < HOURS; h++) {
    const hour  = START_HOUR + h;
    const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
    const top   = h * HOUR_H;
    html += `<div style="position:absolute;top:${top}px;left:0;width:52px;font-size:10px;color:var(--stone);text-align:right;padding-right:8px;transform:translateY(-6px)">${label}</div>`;
    html += `<div style="position:absolute;top:${top}px;left:56px;right:0;border-top:1px solid rgba(196,169,109,0.1)"></div>`;
    if (h < HOURS - 1) html += `<div style="position:absolute;top:${top + 30}px;left:56px;right:0;border-top:1px dashed rgba(196,169,109,0.05)"></div>`;
  }

  // now line
  const now = new Date();
  if (dateStr === toDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate())) {
    const nowMin = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
    const nowTop = nowMin * (HOUR_H / 60);
    html += `<div style="position:absolute;top:${nowTop}px;left:56px;right:0;height:2px;background:var(--gold);z-index:3">
               <div style="width:8px;height:8px;border-radius:50%;background:var(--gold);position:absolute;left:-4px;top:-3px"></div>
             </div>`;
  }

  // appointment blocks
  bookings.forEach(b => {
    const [bh, bm] = b.start_time.split(':').map(Number);
    const top    = ((bh - START_HOUR) * 60 + bm) * (HOUR_H / 60);
    const height = Math.max(b.duration_minutes * (HOUR_H / 60), 24);
    const cls    = ['confirmed','pending','completed'].includes(b.status) ? b.status : 'completed';
    html += `<div class="appt-block ${cls}" style="top:${top}px;height:${height}px;position:absolute;left:60px;right:4px">
               <strong>${b.service_name}</strong>
               <span>${b.start_time.slice(0,5)}${b.treatment_area ? ' · ' + b.treatment_area : ''}</span>
             </div>`;
  });

  html += `</div>`;
  body.innerHTML = html;
}

// ── WEEK VIEW ─────────────────────────────────────────────────────────────────
async function renderWeek() {
  const body      = document.getElementById('cal-body');
  const weekStart = getWeekStart(currentDate);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  const bookings  = await getBookingsForRange(weekStart, weekEnd);
  const today     = new Date();
  const START_HOUR = 7, HOURS = 14, HOUR_H = 60;

  let html = `<div style="display:flex;flex-direction:column;height:100%">`;

  // header row
  html += `<div style="display:grid;grid-template-columns:52px repeat(7,1fr);flex-shrink:0;border-bottom:1px solid rgba(196,169,109,0.15);background:var(--white)">`;
  html += `<div></div>`;
  for (let i = 0; i < 7; i++) {
    const d       = new Date(weekStart); d.setDate(d.getDate() + i);
    const isToday = d.toDateString() === today.toDateString();
    html += `<div style="padding:8px 4px;text-align:center;border-right:1px solid rgba(196,169,109,0.08)">
               <div style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--stone)">${DAYS_SHORT[d.getDay()]}</div>
               <div style="font-family:var(--serif);font-size:20px;color:${isToday ? 'var(--gold)' : 'var(--ink)'}">${d.getDate()}</div>
             </div>`;
  }
  html += `</div>`;

  // scrollable body
  html += `<div style="flex:1;overflow-y:auto"><div style="display:grid;grid-template-columns:52px repeat(7,1fr);height:${HOURS * HOUR_H}px">`;

  // time label column
  html += `<div>`;
  for (let h = 0; h < HOURS; h++) {
    const hour  = START_HOUR + h;
    const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
    html += `<div style="height:${HOUR_H}px;font-size:10px;color:var(--stone);text-align:right;padding-right:6px;padding-top:2px">${label}</div>`;
  }
  html += `</div>`;

  // day columns
  for (let i = 0; i < 7; i++) {
    const d        = new Date(weekStart); d.setDate(d.getDate() + i);
    const dateStr  = toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const dayBookings = bookings.filter(b => b.date === dateStr);

    html += `<div style="border-right:1px solid rgba(196,169,109,0.08);position:relative">`;
    for (let h = 0; h < HOURS; h++) {
      html += `<div style="height:${HOUR_H}px;border-top:1px solid rgba(196,169,109,0.08)"></div>`;
    }
    dayBookings.forEach(b => {
      const [bh, bm] = b.start_time.split(':').map(Number);
      const top    = ((bh - START_HOUR) * 60 + bm) * (HOUR_H / 60);
      const height = Math.max(b.duration_minutes * (HOUR_H / 60), 20);
      const cls    = ['confirmed','pending','completed'].includes(b.status) ? b.status : 'completed';
      html += `<div class="appt-block ${cls}" style="position:absolute;top:${top}px;height:${height}px;left:1px;right:1px;font-size:10px;padding:3px 5px">
                 <strong style="font-size:10px">${b.start_time.slice(0,5)}</strong>
                 <span style="font-size:9px">${b.service_name.split('-')[0].trim()}</span>
               </div>`;
    });
    html += `</div>`;
  }
  html += `</div></div></div>`;
  body.innerHTML = html;
}

// ── HELPER ────────────────────────────────────────────────────────────────────
function toDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
