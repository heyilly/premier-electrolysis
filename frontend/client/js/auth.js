// ── CONFIG ────────────────────────────────────────────────────────────────────
const API = 'http://98.84.133.32';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── STATE ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('pe_token');
let user  = JSON.parse(localStorage.getItem('pe_user') || 'null');

// ── HEADERS ───────────────────────────────────────────────────────────────────
function H()  { return { Authorization: `Bearer ${token}` }; }
function HJ() { return { ...H(), 'Content-Type': 'application/json' }; }

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────
function toggleAuth(mode) {
  document.getElementById('login-panel').style.display    = mode === 'login'    ? 'block' : 'none';
  document.getElementById('register-panel').style.display = mode === 'register' ? 'block' : 'none';
}

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
  if (!r.ok) {
    document.getElementById('login-err').textContent = d.detail || 'Login failed';
    return;
  }
  saveAuth(d);
}

async function doRegister() {
  const fname = document.getElementById('reg-fname').value.trim();
  const lname = document.getElementById('reg-lname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  document.getElementById('reg-err').textContent = '';

  if (!fname || !lname || !email || !pass) {
    document.getElementById('reg-err').textContent = 'Please fill in all required fields.';
    return;
  }
  if (pass.length < 6) {
    document.getElementById('reg-err').textContent = 'Password must be at least 6 characters.';
    return;
  }

  const r = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass, first_name: fname, last_name: lname, phone }),
  });
  const d = await r.json();
  if (!r.ok) {
    document.getElementById('reg-err').textContent = d.detail || 'Registration failed';
    return;
  }
  saveAuth(d);
}

function saveAuth(d) {
  token = d.access_token;
  user  = { id: d.user_id, role: d.role, first_name: d.first_name };
  localStorage.setItem('pe_token', token);
  localStorage.setItem('pe_user', JSON.stringify(user));
  showApp();
}

function logout() {
  localStorage.removeItem('pe_token');
  localStorage.removeItem('pe_user');
  location.reload();
}

// ── SHOW APP ──────────────────────────────────────────────────────────────────
function showApp() {
  document.getElementById('auth-wrap').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('nav-name').textContent = user.first_name;
  buildSvcList();
  renderCal();
}

// ── TABS ──────────────────────────────────────────────────────────────────────
function showTab(name) {
  ['book', 'bookings', 'sessions', 'photos'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === name);
    document.getElementById(`tab-${t}-content`).style.display = t === name ? 'block' : 'none';
  });
  if (name === 'bookings') loadBookings();
  if (name === 'sessions') loadSessions();
  if (name === 'photos')   loadPhotos();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
if (token && user) showApp();
