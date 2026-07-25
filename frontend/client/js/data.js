// ── APPOINTMENTS ─────────────────────────────────────────────────────────────
async function loadBookings() {
  const list   = document.getElementById('bookings-list');
  const notice = document.getElementById('pending-notice');

  notice.style.display = justSubmitted ? 'flex' : 'none';
  list.innerHTML = '<p class="loading">Loading…</p>';

  try {
    const r = await fetch(`${API}/bookings/mine`, { headers: H() });
    const data = await r.json();

    if (!data.length) {
      list.innerHTML = '<div class="empty"><strong>No appointments yet</strong>Book your first session in the Book a session tab.</div>';
      return;
    }

    // sort: upcoming first, then past
    const now = new Date();
    data.sort((a, b) => new Date(a.date) - new Date(b.date));

    list.innerHTML = data.map(b => {
      const dt = new Date(b.date + 'T12:00:00');
      return `
      <div class="booking-row">
        <div class="bk-date">
          ${dt.getDate()}
          <small>${dt.toLocaleString('en-US',{month:'short'})} ${dt.getFullYear()}</small>
        </div>
        <div class="bk-info">
          <strong>${b.service_name}</strong>
          <span>${formatTimeDisplay(b.start_time.slice(0,5))}${b.treatment_area ? ' · ' + b.treatment_area : ''}</span>
        </div>
        <span class="status-pill sp-${b.status}">${b.status.replace('_',' ')}</span>
      </div>`;
    }).join('');

  } catch (e) {
    list.innerHTML = '<p class="loading">Could not load appointments. Is the backend running?</p>';
  }
}


// ── SESSIONS ─────────────────────────────────────────────────────────────────
async function loadSessions() {
  const list = document.getElementById('sessions-list');
  list.innerHTML = '<p class="loading">Loading…</p>';

  try {
    const r = await fetch(`${API}/sessions/mine`, { headers: H() });
    const data = await r.json();

    if (!data.length) {
      list.innerHTML = '<div class="empty"><strong>No sessions yet</strong>Your visit records will appear here after your first appointment.</div>';
      return;
    }

    list.innerHTML = data.map(s => {
      const dt = new Date(s.session_date);
      const areas = (s.areas || []).map(a => `
        <span class="area-tag">${a.treatment_area}</span>
        <span class="area-tag intensity-tag">Intensity ${a.intensity_level}</span>
      `).join('');

      return `
      <div class="session-card">
        <div class="session-date">${dt.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
        <div style="margin-top:6px">${areas}</div>
        ${s.owner_notes ? `<div class="session-notes">${s.owner_notes}</div>` : ''}
      </div>`;
    }).join('');

  } catch (e) {
    list.innerHTML = '<p class="loading">Could not load sessions. Is the backend running?</p>';
  }
}


// ── PHOTOS ────────────────────────────────────────────────────────────────────
let allPhotos = [];

async function loadPhotos() {
  try {
    const r = await fetch(`${API}/photos/mine`, { headers: H() });
    allPhotos = await r.json();
    renderPhotos(allPhotos);
  } catch (e) {
    document.getElementById('photo-grid').innerHTML = '<p class="loading">Could not load photos.</p>';
  }
}

function renderPhotos(photos) {
  const grid = document.getElementById('photo-grid');
  if (!photos.length) {
    grid.innerHTML = '<div class="empty"><strong>No photos yet</strong>Ambar will upload your progress photos here.</div>';
    return;
  }
  grid.innerHTML = photos.map(p => `
    <div class="photo-item">
      <img src="${p.s3_url}" alt="${p.type} photo${p.treatment_area ? ' - ' + p.treatment_area : ''}">
      <div class="photo-badge">${p.type}${p.treatment_area ? ' · ' + p.treatment_area : ''}</div>
      ${p.caption ? `<div class="photo-caption">${p.caption}</div>` : ''}
    </div>`).join('');
}

function filterPhotos(type, btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPhotos(type === 'all' ? allPhotos : allPhotos.filter(p => p.type === type));
}
