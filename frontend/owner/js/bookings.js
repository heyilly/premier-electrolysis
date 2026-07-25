// ── AVAILABILITY STATE ────────────────────────────────────────────────────────
let availType  = 'available';
let showRepeat = false;

// ── AVAILABILITY TYPE TOGGLE ──────────────────────────────────────────────────
function setAvailType(type, btn) {
  availType = type;
  document.querySelectorAll('.avail-toggle').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function toggleRepeat() {
  showRepeat = !showRepeat;
  document.getElementById('repeat-panel').style.display = showRepeat ? 'block' : 'none';
}

// ── APPLY AVAILABILITY ────────────────────────────────────────────────────────
async function applyAvailability() {
  const start = document.getElementById('avail-start').value;
  const end   = document.getElementById('avail-end').value;

  if (!start || !end) { alert('Please set a start and end time.'); return; }
  if (start >= end)   { alert('End time must be after start time.'); return; }

  // which days to apply to
  let targetDays = [];
  if (showRepeat) {
    targetDays = [...document.querySelectorAll('.repeat-day:checked')].map(c => c.value);
    if (!targetDays.length) { alert('Please select at least one day for the recurring schedule.'); return; }
  } else {
    // single selected day
    targetDays = [currentDate.toLocaleDateString('en-US',{weekday:'long'}).toLowerCase()];
  }

  const endDate = document.getElementById('repeat-end').value || null;

  for (const day of targetDays) {
    const body = {
      day_of_week:  day,
      open_time:    start,
      close_time:   end,
      is_blocked:   availType === 'blocked' || availType === 'blackout',
      note:         availType === 'blackout' ? 'Blackout' : availType === 'blocked' ? 'Blocked' : null,
    };
    // for single-day non-recurring, attach the specific date
    if (!showRepeat && availType !== 'available') {
      body.blocked_date = toDateStr(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
    }
    await fetch(`${API}/availability`, { method: 'POST', headers: HJ(), body: JSON.stringify(body) });
  }

  const msg = document.getElementById('avail-msg');
  msg.style.display = 'block';
  setTimeout(() => msg.style.display = 'none', 2500);
  await renderCalendar();
}

// ── PENDING REQUESTS ──────────────────────────────────────────────────────────
async function loadPending() {
  let bookings = [];
  try {
    const r = await fetch(`${API}/bookings?status=pending`, { headers: H() });
    bookings = await r.json();
  } catch (e) { bookings = []; }

  // update badge
  const badge = document.getElementById('rp-count');
  if (bookings.length) { badge.style.display = 'inline'; badge.textContent = bookings.length; }
  else badge.style.display = 'none';

  const list = document.getElementById('pending-list');
  if (!bookings.length) {
    list.innerHTML = '<p class="empty-state" style="padding:8px 0;font-size:12px">No pending requests</p>';
    return;
  }

  list.innerHTML = bookings.map((b, i) => {
    const dt       = new Date(b.date + 'T12:00:00');
    const dateLabel = dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    const endTime  = addMinutes(b.start_time, b.duration_minutes);
    const initials = (b.client_name || 'C').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return `
    <div class="req-card${i === 0 ? ' top-match' : ''}">
      ${i === 0 ? '<div class="top-match-label">★ Top match</div>' : ''}
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div class="req-avatar">${initials}</div>
        <div>
          <div class="req-name">${b.client_name || 'New client'}</div>
          <div class="req-detail">🕐 ${dateLabel} · ${b.start_time.slice(0,5)}–${endTime}</div>
          <div class="req-detail">📋 ${b.service_name}</div>
          ${b.is_first_visit ? '<div style="font-size:10px;color:var(--confirmed);margin-top:3px">★ First visit</div>' : ''}
          ${b.client_notes  ? `<div style="font-size:10px;color:var(--stone);margin-top:4px;font-style:italic">"${b.client_notes}"</div>` : ''}
        </div>
      </div>
      <div class="req-actions">
        <button class="act-approve" onclick="updateBookingStatus('${b.id}','confirmed')">Approve</button>
        <button class="act-decline" onclick="updateBookingStatus('${b.id}','cancelled')">Decline</button>
      </div>
    </div>`;
  }).join('');
}

async function updateBookingStatus(id, status) {
  await fetch(`${API}/bookings/${id}/status`, {
    method: 'PATCH',
    headers: HJ(),
    body: JSON.stringify({ status }),
  });
  await loadPending();
  await renderCalendar();
  if (currentClient) openClientProfile(currentClient.id);
}

// ── ADD APPOINTMENT MANUALLY ──────────────────────────────────────────────────
function openAddApptModal() {
  document.getElementById('add-appt-modal').classList.add('open');
  document.getElementById('m-date').value = toDateStr(
    new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()
  );
  document.getElementById('m-err').textContent = '';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

async function submitManualAppt() {
  const fname  = document.getElementById('m-fname').value.trim();
  const lname  = document.getElementById('m-lname').value.trim();
  const email  = document.getElementById('m-email').value.trim();
  const phone  = document.getElementById('m-phone').value.trim();
  const svcRaw = document.getElementById('m-service').value.split(':');
  const date   = document.getElementById('m-date').value;
  const time   = document.getElementById('m-time').value;
  const area   = document.getElementById('m-area').value;
  const notes  = document.getElementById('m-notes').value;
  const errEl  = document.getElementById('m-err');

  if (!fname || !lname || !email || !date || !time) {
    errEl.textContent = 'Please fill in name, email, date, and time.';
    return;
  }
  errEl.textContent = '';

  const body = {
    first_name:    fname,
    last_name:     lname,
    email,
    phone,
    service_name:  svcRaw[0],
    date,
    start_time:    time,
    treatment_area: area,
    client_notes:  notes,
    is_first_visit: false,
  };

  const r = await fetch(`${API}/bookings/request`, { method: 'POST', headers: HJ(), body: JSON.stringify(body) });
  if (!r.ok) { errEl.textContent = 'Failed to create booking. Please try again.'; return; }

  const d = await r.json();
  // immediately confirm — owner booking goes straight to confirmed
  await fetch(`${API}/bookings/${d.booking_id}/status`, {
    method: 'PATCH', headers: HJ(), body: JSON.stringify({ status: 'confirmed' }),
  });

  closeModal('add-appt-modal');
  await renderCalendar();
  await loadPending();
  // reset form
  ['m-fname','m-lname','m-email','m-phone','m-area','m-notes'].forEach(id => document.getElementById(id).value = '');
}

// ── HELPER ────────────────────────────────────────────────────────────────────
function addMinutes(timeStr, mins) {
  const [h, m]   = timeStr.split(':').map(Number);
  const total    = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
}
