// ── CONFIG ────────────────────────────────────────────────────────────────────
const API = 'https://d4yqdbub69k9y.cloudfront.net/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── STATE ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('pe_owner_token');

// ── HEADERS ───────────────────────────────────────────────────────────────────
function H()  { return { Authorization: `Bearer ${token}` }; }
function HJ() { return { ...H(), 'Content-Type': 'application/json' }; }

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  document.getElementById('login-err').textContent = '';

  if (!email || !pass) {
    document.getElementById('login-err').textContent = 'Please enter your email and password.';
    return;
  }

  const fd = new FormData();
  fd.append('username', email);
  fd.append('password', pass);

  const r = await fetch(`${API}/auth/login`, { method: 'POST', body: fd });
  const d = await r.json();

  if (!r.ok) { document.getElementById('login-err').textContent = d.detail || 'Login failed'; return; }
  if (d.role !== 'owner') { document.getElementById('login-err').textContent = 'Owner access only'; return; }

  token = d.access_token;
  localStorage.setItem('pe_owner_token', token);
  showApp(d.first_name);
}

function logout() {
  localStorage.removeItem('pe_owner_token');
  location.reload();
}

// ── SHOW APP ──────────────────────────────────────────────────────────────────
function showApp(name) {
  document.getElementById('auth-wrap').style.display = 'none';
  document.getElementById('topnav').style.display = 'flex';
  document.getElementById('app-layout').style.display = 'flex';
  document.getElementById('nav-name').textContent = name || 'Ambar';
  renderCalendar();
  loadPending();
  loadClients();
}

// ── PAGE NAVIGATION ───────────────────────────────────────────────────────────
function showMainPage(name) {
  ['calendar', 'clients', 'profile'].forEach(p => {
    document.getElementById(`page-${p}`).classList.toggle('active', p === name);
  });
  ['calendar', 'clients'].forEach(n => {
    const el = document.getElementById(`nl-${n}`);
    if (el) el.classList.toggle('active', n === name);
  });

  const isCalendar = name === 'calendar';
  document.getElementById('avail-tools').style.display     = isCalendar ? 'block' : 'none';
  document.getElementById('cal-nav-group').style.display   = isCalendar ? 'contents' : 'none';
  document.getElementById('view-toggle-group').style.display = isCalendar ? 'flex' : 'none';
  document.getElementById('today-btn').style.display       = isCalendar ? 'block' : 'none';
  document.getElementById('cal-title').textContent = isCalendar ? getCalTitle() : (name === 'clients' ? 'Clients' : '');

  if (name === 'calendar') renderCalendar();
  if (name === 'clients')  renderClients(allClients);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
if (token) showApp();
