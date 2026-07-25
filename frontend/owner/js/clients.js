// ── CLIENTS STATE ─────────────────────────────────────────────────────────────
let allClients    = [];
let currentClient = null;
let areaRowCount  = 0;

// ── LOAD CLIENTS ──────────────────────────────────────────────────────────────
async function loadClients() {
  try {
    const r = await fetch(`${API}/clients`, { headers: H() });
    allClients = await r.json();
  } catch (e) { allClients = []; }
}

// ── RENDER CLIENT TABLE ───────────────────────────────────────────────────────
function filterClients(q) {
  const filtered = q
    ? allClients.filter(c => `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
    : allClients;
  renderClients(filtered);
}

function renderClients(clients) {
  const tbody = document.getElementById('clients-tbody');
  if (!clients.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No clients yet.</td></tr>';
    return;
  }
  tbody.innerHTML = clients.map(c => {
    const since = new Date(c.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'});
    return `
    <tr onclick="openClientProfile('${c.id}')">
      <td><span class="status-dot ${c.is_active ? 'dot-active' : 'dot-inactive'}"></span>${c.first_name} ${c.last_name}</td>
      <td>${c.email}</td>
      <td>${c.phone || '—'}</td>
      <td>${since}</td>
      <td><span class="status-pill ${c.is_active ? 'sp-confirmed' : 'sp-cancelled'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
    </tr>`;
  }).join('');
}

// ── OPEN CLIENT PROFILE ───────────────────────────────────────────────────────
async function openClientProfile(id) {
  showMainPage('profile');
  try {
    const r = await fetch(`${API}/clients/${id}`, { headers: H() });
    const c = await r.json();
    currentClient = c;

    document.getElementById('prof-avatar').textContent = c.first_name[0].toUpperCase();
    document.getElementById('prof-name').textContent   = `${c.first_name} ${c.last_name}`;
    document.getElementById('prof-meta').textContent   =
      `${c.email} · ${c.phone || 'No phone'} · Client since ${new Date(c.created_at).toLocaleDateString('en-US',{month:'long',year:'numeric'})}`;

    renderProfileBookings(c.bookings || []);
    renderProfileSessions(c.sessions || []);
    renderProfilePhotos(c.photos    || []);
    renderProfileFees(c.no_show_fees || []);
  } catch (e) {
    document.getElementById('prof-name').textContent = 'Error loading client';
  }
}

function showProfileTab(name, el) {
  document.querySelectorAll('.profile-tab').forEach(t     => t.classList.remove('active'));
  document.querySelectorAll('.profile-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`ptab-${name}`).classList.add('active');
}

// ── BOOKINGS TAB ──────────────────────────────────────────────────────────────
function renderProfileBookings(bookings) {
  const el = document.getElementById('profile-bookings');
  if (!bookings.length) { el.innerHTML = '<p class="empty-state">No bookings.</p>'; return; }

  el.innerHTML = bookings.map(b => {
    const dt = new Date(b.date + 'T12:00:00');
    return `
    <div class="booking-item">
      <div>
        <div class="bk-date-num">${dt.getDate()}</div>
        <div class="bk-date-mon">${dt.toLocaleString('en-US',{month:'short'})}</div>
      </div>
      <div class="bk-info">
        <strong>${b.service_name}</strong>
        <span>${b.start_time.slice(0,5)}</span>
      </div>
      <span class="status-pill sp-${b.status}">${b.status.replace('_',' ')}</span>
      ${b.status === 'confirmed' ? `
      <div class="bk-acts">
        <button class="bk-act bk-act-complete" onclick="updateBookingStatus('${b.id}','completed')">Complete</button>
        <button class="bk-act bk-act-noshow"   onclick="updateBookingStatus('${b.id}','no_show')">No-show</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

// ── SESSIONS TAB ─────────────────────────────────────────────────────────────
function renderProfileSessions(sessions) {
  const el = document.getElementById('profile-sessions');
  const list = sessions.map(s => `
    <div class="booking-item" style="flex-direction:column;align-items:flex-start">
      <div style="font-family:var(--serif);font-size:15px;margin-bottom:4px">
        ${new Date(s.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
      </div>
      ${s.notes ? `<p style="font-size:12px;color:var(--stone)">${s.notes}</p>` : ''}
    </div>`).join('');
  el.innerHTML = list || '<p class="empty-state">No sessions yet.</p>';
}

function addAreaRow() {
  areaRowCount++;
  const row = document.createElement('div');
  row.className = 'area-row';
  row.id = `ar-${areaRowCount}`;
  row.innerHTML = `
    <div class="field"><label>Area</label><input type="text" placeholder="e.g. upper lip"></div>
    <div class="field short"><label>Intensity</label><input type="number" min="1" max="20" placeholder="8"></div>
    <button class="remove-area" onclick="this.parentElement.remove()">×</button>`;
  document.getElementById('area-rows').appendChild(row);
}

async function submitSession() {
  const areas = [];
  document.querySelectorAll('#area-rows .area-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    if (inputs[0].value && inputs[1].value) {
      areas.push({ treatment_area: inputs[0].value, intensity_level: parseInt(inputs[1].value) });
    }
  });

  const body = {
    client_id:    currentClient.id,
    session_date: document.getElementById('ses-date').value,
    owner_notes:  document.getElementById('ses-notes').value,
    areas,
  };

  const r = await fetch(`${API}/sessions`, { method: 'POST', headers: HJ(), body: JSON.stringify(body) });
  if (r.ok) {
    const msg = document.getElementById('ses-msg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2000);
    document.getElementById('ses-date').value  = '';
    document.getElementById('ses-notes').value = '';
    document.getElementById('area-rows').innerHTML = '';
    openClientProfile(currentClient.id);
  }
}

// ── PHOTOS TAB ────────────────────────────────────────────────────────────────
function renderProfilePhotos(photos) {
  const grid = document.getElementById('profile-photos');
  if (!photos.length) { grid.innerHTML = '<p class="empty-state">No photos uploaded yet.</p>'; return; }
  grid.innerHTML = photos.map(p => `
    <div class="photo-item">
      <img src="${p.s3_url}" alt="${p.type}">
      <div class="photo-badge-owner">
        <span>${p.type}${p.treatment_area ? ' · ' + p.treatment_area : ''}</span>
        <button class="photo-del" onclick="deletePhoto('${p.id}')">×</button>
      </div>
    </div>`).join('');
}

async function uploadPhoto() {
  const file = document.getElementById('photo-input').files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append('file',           file);
  fd.append('photo_type',     document.getElementById('upload-type').value);
  fd.append('treatment_area', document.getElementById('upload-area').value);

  const msg = document.getElementById('upload-msg');
  const r   = await fetch(`${API}/photos/upload/${currentClient.id}`, { method: 'POST', headers: H(), body: fd });
  if (r.ok) {
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2000);
    document.getElementById('photo-input').value = '';
    openClientProfile(currentClient.id);
  } else {
    msg.textContent = 'Upload failed.';
    msg.style.color = 'var(--red)';
    msg.style.display = 'block';
  }
}

async function deletePhoto(id) {
  if (!confirm('Delete this photo?')) return;
  await fetch(`${API}/photos/${id}`, { method: 'DELETE', headers: H() });
  openClientProfile(currentClient.id);
}

// ── FEES TAB ──────────────────────────────────────────────────────────────────
function renderProfileFees(fees) {
  const el = document.getElementById('profile-fees');
  if (!fees.length) { el.innerHTML = '<p class="empty-state">No fees.</p>'; return; }
  el.innerHTML = fees.map(f => `
    <div class="fee-row">
      <div class="fee-amount">$${(f.amount_cents / 100).toFixed(2)}</div>
      <div class="fee-info">
        <strong>${new Date(f.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</strong>
        <span>${f.status}${f.waived_reason ? ' · ' + f.waived_reason : ''}</span>
      </div>
      ${f.status === 'unpaid' ? `
      <button class="fee-act fee-pay"   onclick="updateFee('${f.id}','paid')">Paid</button>
      <button class="fee-act fee-waive" onclick="waivedFee('${f.id}')">Waive</button>` :
      `<span style="font-size:10px;color:var(--stone)">${f.status}</span>`}
    </div>`).join('');
}

async function updateFee(feeId, status, waived_reason = null) {
  const body = { status };
  if (waived_reason) body.waived_reason = waived_reason;
  await fetch(`${API}/clients/${currentClient.id}/no-show-fees/${feeId}`, {
    method: 'PATCH', headers: HJ(), body: JSON.stringify(body),
  });
  openClientProfile(currentClient.id);
}

function waivedFee(id) {
  const reason = prompt('Reason for waiving (optional):') || '';
  updateFee(id, 'waived', reason);
}
