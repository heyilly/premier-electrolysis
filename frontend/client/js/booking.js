// ── BOOKING STATE ─────────────────────────────────────────────────────────────
const SVCS = [
  { name: 'Consultation',       dur: '60 min',  price: '$0',   cents: 0,     minutes: 60  },
  { name: '15-Minute Session',  dur: '15 min',  price: '$45',  cents: 4500,  minutes: 15  },
  { name: '30-Minute Session',  dur: '30 min',  price: '$80',  cents: 8000,  minutes: 30  },
  { name: '60-Minute Session',  dur: '60 min',  price: '$145', cents: 14500, minutes: 60,  popular: true },
  { name: '90-Minute Session',  dur: '90 min',  price: '$210', cents: 21000, minutes: 90  },
  { name: '2-Hour Session',     dur: '120 min', price: '$270', cents: 27000, minutes: 120 },
];

let BK = {
  svc:   null,
  month: new Date().getMonth(),
  year:  new Date().getFullYear(),
  day:   null,
  time:  null,   // stored as "HH:MM" 24h format
};

let justSubmitted = false;

// ── SERVICE LIST ──────────────────────────────────────────────────────────────
function buildSvcList() {
  const el = document.getElementById('svc-list');
  el.innerHTML = SVCS.map((s, i) => `
    <div class="svc-card" onclick="selectSvc(${i}, this)">
      ${s.popular ? '<div class="popular-label">Most popular</div>' : ''}
      <div class="svc-name">${s.name}</div>
      <div class="svc-meta">
        <span>${s.dur}</span>
        <span class="svc-price">${s.price}</span>
      </div>
    </div>`).join('');
}

function selectSvc(i, el) {
  document.querySelectorAll('.svc-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  BK.svc = SVCS[i];
  const btn = document.getElementById('bk-next-1');
  btn.style.opacity = '1';
  btn.style.pointerEvents = 'auto';
}

// ── STEP NAVIGATION ───────────────────────────────────────────────────────────
function bkGo(step) {
  [1, 2, 3].forEach(n => {
    const el = document.getElementById('bk-s' + n);
    if (el) el.style.display = n === step ? 'block' : 'none';
  });
  [1, 2, 3].forEach(n => {
    const p = document.getElementById('bk-pill-' + n);
    if (!p) return;
    p.classList.remove('active', 'done');
    if (n < step)      p.classList.add('done');
    else if (n === step) p.classList.add('active');
  });
  if (step === 2) renderCal();
  if (step === 3) populateSummary();
}

function populateSummary() {
  document.getElementById('sum-svc').textContent   = BK.svc.name;
  document.getElementById('sum-date').textContent  = `${MONTHS[BK.month]} ${BK.day}, ${BK.year}`;
  document.getElementById('sum-time').textContent  = formatTimeDisplay(BK.time);
  document.getElementById('sum-price').textContent = BK.svc.price;
}

// ── CALENDAR ──────────────────────────────────────────────────────────────────
function renderCal() {
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  document.getElementById('cal-label').textContent = `${MONTHS[BK.month]} ${BK.year}`;

  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-day cal-hdr';
    h.textContent = d;
    grid.appendChild(h);
  });

  const first = new Date(BK.year, BK.month, 1).getDay();
  const total = new Date(BK.year, BK.month + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (let i = 0; i < first; i++) {
    const e = document.createElement('div'); e.className = 'cal-day'; grid.appendChild(e);
  }

  for (let d = 1; d <= total; d++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;
    const dt = new Date(BK.year, BK.month, d);
    if (dt < today || dt.getDay() === 0 || dt.getDay() === 6) {
      cell.classList.add('past');
    } else {
      cell.classList.add('avail');
      if (BK.day === d) cell.classList.add('sel');
      const dd = d;
      cell.onclick = () => selectDay(dd);
    }
    grid.appendChild(cell);
  }
}

function calNav(dir) {
  BK.month += dir;
  if (BK.month > 11) { BK.month = 0; BK.year++; }
  if (BK.month < 0)  { BK.month = 11; BK.year--; }
  BK.day  = null;
  BK.time = null;
  renderCal();
  document.getElementById('time-area').style.display = 'none';
  setNext2Disabled(true);
}

// ── TIME SLOTS ────────────────────────────────────────────────────────────────
async function selectDay(d) {
  BK.day  = d;
  BK.time = null;
  renderCal();

  const dateStr = toDateStr(BK.year, BK.month + 1, d);
  let slots = [];
  try {
    const r = await fetch(`${API}/availability/slots?date=${dateStr}&duration=${BK.svc.minutes}`);
    const data = await r.json();
    slots = data.slots || [];
  } catch (e) { /* backend not reachable */ }

  const tg = document.getElementById('time-grid');
  tg.innerHTML = '';

  if (!slots.length) {
    tg.innerHTML = '<p style="font-size:12px;color:var(--stone);grid-column:1/-1">No availability on this date — please choose another day.</p>';
  } else {
    slots.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'time-btn';
      btn.textContent = formatTimeDisplay(t);  // display as "9:00 am"
      btn.onclick = () => selectTime(t, btn);  // store as "09:00"
      tg.appendChild(btn);
    });
  }

  document.getElementById('time-area').style.display = 'block';
  setNext2Disabled(true);
}

function selectTime(t, el) {
  BK.time = t;  // "09:00" 24h format from backend
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  setNext2Disabled(false);
}

function setNext2Disabled(disabled) {
  const btn = document.getElementById('bk-next-2');
  btn.style.opacity = disabled ? '0.35' : '1';
  btn.style.pointerEvents = disabled ? 'none' : 'auto';
}

// ── SUBMIT BOOKING ────────────────────────────────────────────────────────────
async function submitBooking() {
  const btn = document.getElementById('bk-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    // fetch current user details to fill backend required fields
    const meResp = await fetch(`${API}/auth/me`, { headers: H() });
    const me = await meResp.json();

    const body = {
      first_name:    me.first_name,
      last_name:     me.last_name  || '',
      email:         me.email,
      phone:         me.phone      || '',
      service_name:  BK.svc.name,
      date:          toDateStr(BK.year, BK.month + 1, BK.day),
      start_time:    BK.time,   // already "HH:MM" from backend
      client_notes:  document.getElementById('bk-notes').value,
      is_first_visit: false,
    };

    const r = await fetch(`${API}/bookings/request`, {
      method: 'POST',
      headers: HJ(),
      body: JSON.stringify(body),
    });

    if (r.ok) {
      // reset state
      BK = { svc: null, month: new Date().getMonth(), year: new Date().getFullYear(), day: null, time: null };
      justSubmitted = true;

      // reset UI
      document.querySelectorAll('.svc-card').forEach(c => c.classList.remove('sel'));
      document.getElementById('bk-notes').value = '';
      bkGo(1);
      document.getElementById('bk-next-1').style.opacity = '0.35';
      document.getElementById('bk-next-1').style.pointerEvents = 'none';

      // redirect to My Appointments
      showTab('bookings');
    } else {
      const err = await r.json();
      alert(err.detail || 'Booking failed. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Request appointment';
    }
  } catch (e) {
    alert('Network error. Please check your connection and try again.');
    btn.disabled = false;
    btn.textContent = 'Request appointment';
  }
}

// ── TIME FORMAT HELPERS ───────────────────────────────────────────────────────
function toDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// "09:30" → "9:30 am", "14:00" → "2:00 pm"
function formatTimeDisplay(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${period}`;
}
