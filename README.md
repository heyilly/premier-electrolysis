# Premier Electrolysis – Full Platform

## Project structure

```
premier/
├── backend/
│   ├── main.py                   ← FastAPI entry point
│   ├── database.py               ← SQLAlchemy async engine
│   ├── models.py                 ← ORM models
│   ├── auth_utils.py             ← JWT + password hashing
│   ├── requirements.txt
│   ├── .env.example
│   └── routers/
│       ├── auth.py               ← login, register, me
│       ├── bookings.py           ← booking CRUD + calendar
│       ├── sessions.py           ← session records + areas
│       ├── clients.py            ← owner client management
│       ├── photos.py             ← S3 upload/delete
│       └── availability.py      ← hours + slot generation
├── frontend/
│   ├── client/index.html         ← client portal
│   └── owner/index.html          ← owner portal
├── schema.sql                    ← run this first
├── render.yaml                   ← Render deployment config
├── netlify.toml                  ← Netlify redirect config
└── .gitignore
```

---

## Step 1 — Local setup

```bash
# Clone / create repo
git init && git add . && git commit -m "initial"

# Install backend dependencies
cd backend
pip install -r requirements.txt

# Create local Postgres DB
createdb premier
psql -d premier -f ../schema.sql

# Set environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL, SECRET_KEY, S3 credentials

# Run backend
uvicorn main:app --reload --port 8000
```

Visit http://localhost:8000 — should return `{"status":"ok"}`

Interactive API docs: http://localhost:8000/docs

---

## Step 2 — Set owner password

After running schema.sql, set Ambar's password:

```bash
curl -X POST http://localhost:8000/auth/set-password \
  -H "Content-Type: application/json" \
  -d '{"email":"ambar@premierelectrolysis.com","password":"ChooseAStrongPassword"}'
```

---

## Step 3 — Test locally

Open `frontend/owner/index.html` in a browser.
Log in with ambar@premierelectrolysis.com + the password you just set.

Open `frontend/client/index.html` in a browser.
Register a test client account.

Submit a booking request from the client portal.
Confirm it from the owner portal.
Log a session with treatment areas.
Upload a photo — it will go to S3 (configure first) or fail gracefully.

---

## Step 4 — Set up S3 or Cloudflare R2

### AWS S3 (standard)
1. Create bucket: `premier-electrolysis-photos`
2. Uncheck "Block all public access"
3. Add bucket policy allowing public read:
```json
{
  "Version":"2012-10-17",
  "Statement":[{
    "Effect":"Allow",
    "Principal":"*",
    "Action":"s3:GetObject",
    "Resource":"arn:aws:s3:::premier-electrolysis-photos/*"
  }]
}
```
4. Create IAM user with S3 full access, copy keys to .env

### Cloudflare R2 (cheaper — no egress fees)
1. Create R2 bucket: `premier-electrolysis-photos`
2. Enable public access on the bucket
3. Create R2 API token with Object Read & Write
4. Set in .env:
```
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_REGION=auto
AWS_ACCESS_KEY_ID=<r2_access_key>
AWS_SECRET_ACCESS_KEY=<r2_secret>
```

---

## Step 5 — Deploy backend to Render

1. Push everything to GitHub
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Build command: `pip install -r backend/requirements.txt`
5. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
6. Set root directory to `backend`
7. Add environment variables from .env
8. Create a PostgreSQL database on Render and connect it
9. Run schema.sql against the Render DB:
   ```bash
   psql <render_db_connection_string> -f schema.sql
   ```
10. Set owner password against the live URL

---

## Step 6 — Deploy frontends to Netlify

Deploy two separate sites:

**Client portal:**
- Drag and drop `frontend/client/` folder to Netlify
- Site name: `premier-electrolysis-client` or similar
- Update `const API = '...'` in `client/index.html` to your Render URL

**Owner portal:**
- Drag and drop `frontend/owner/` folder to Netlify
- Site name: `premier-electrolysis-owner`
- Update `const API = '...'` in `owner/index.html` to your Render URL
- Share this URL only with Ambar

**Public site:**
- Deploy `premier_electrolysis.html` (rename to `index.html`) to Netlify
- This is the main public-facing site

---

## Step 7 — Custom domain (optional)

1. In Netlify: Site settings → Domain management → Add custom domain
2. Example: `book.premierelectrolysis.com` for client portal
3. In Cloudflare (or wherever domain is registered):
   - Add CNAME record: `book` → `<netlify-subdomain>.netlify.app`
4. Netlify auto-provisions HTTPS via Let's Encrypt

---

## API reference (key endpoints)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/login | — | Get JWT token |
| POST | /auth/register | — | New client account |
| GET | /auth/me | client | Current user |
| POST | /bookings/request | — | Public booking form |
| GET | /bookings/mine | client | Client's bookings |
| GET | /bookings/calendar?year=&month= | owner | Calendar view |
| PATCH | /bookings/{id}/status | owner | Confirm/complete/no-show |
| GET | /availability/slots?date= | — | Available times for a day |
| GET | /sessions/mine | client | Client session history |
| POST | /sessions | owner | Log a session |
| GET | /clients | owner | All clients |
| GET | /clients/{id} | owner | Client profile |
| POST | /photos/upload/{client_id} | owner | Upload photo |
| GET | /photos/mine | client | Client's visible photos |

Full interactive docs at: `<your-render-url>/docs`

---

## Going live checklist

- [ ] schema.sql applied to production DB
- [ ] Owner password set on production
- [ ] S3/R2 bucket created with public read
- [ ] All `const API = 'http://localhost:8000'` updated to Render URL in both portals
- [ ] `ALLOWED_ORIGINS` in .env includes production domain
- [ ] Tested booking flow end-to-end: request → confirm → session log → photo upload
- [ ] Tested no-show trigger: mark booking no_show → fee appears in client profile
