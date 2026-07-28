# Premier Electrolysis of Houston

A full-stack booking and client management platform built for a Houston electrolysis studio. This is a live demo deployment on AWS.

---

## Live URLs

| Portal | URL |
|--------|-----|
| Public site | https://d4yqdbub69k9y.cloudfront.net |
| Client portal | https://d4yqdbub69k9y.cloudfront.net/client/index.html |
| Owner portal | https://d4yqdbub69k9y.cloudfront.net/owner/index.html |

---

## Test Accounts

### Owner — Ambar
Log into the **Owner Portal** with these credentials.

| Field | Value |
|-------|-------|
| Email | ambar@premierelectrolysis.com |
| Password | pass1 |

### Test Client — Orange Tree
Log into the **Client Portal** with these credentials.

| Field | Value |
|-------|-------|
| Email | ot@gmail.com |
| Password | 8characters |

---

## Creating a New Client Account

Go to the Client Portal and click **Create an account**. Fill in your first name, last name, email, phone, and a password of at least 6 characters. You will be logged in immediately after registering.

---

## Client Portal — What You Can Do

**Book a session**

Open the Book a session tab. Select a service from the list — options range from a complimentary consultation to a 2-hour session. Once you select a service the Continue button activates. Click it to move to the calendar. Pick an available date, then pick a time slot from the options that appear below the calendar. Click Continue again to reach the confirmation screen where you can add optional notes for Ambar. Click Request appointment to submit.

After submitting you are taken directly to the My appointments tab where your new booking appears with a Pending status and a notice that Ambar will confirm it shortly.

**My appointments**

This tab shows all your bookings sorted by date. Each booking shows the service name, time, and current status. Statuses you may see: Pending, Confirmed, Completed, Cancelled, No-show.

**Session history**

After each completed visit, Ambar logs a session record. This tab shows each past visit with the treatment areas, intensity levels used, and any notes Ambar added about your skin.

**My photos**

Ambar uploads before, after, and progress photos to your profile. They appear here organized by type. Use the filter buttons at the top to view only Before, only After, or only Progress photos.

---

## Owner Portal — What You Can Do

**Calendar**

The calendar opens by default when you log in. Use the Day, Week, and Month buttons in the top bar to switch views. The left and right arrows navigate between time periods. The Today button returns you to the current date.

In Day and Week view, confirmed appointments appear as dark green blocks, pending requests appear as yellow dashed blocks. Click any date in Month view to drill into that day.

**Availability Tools**

The left panel contains availability tools. Select Available, Blocked, or Blackout depending on what you want to set. Use the Start and End time fields to define the hours. Click the Repeat button to open recurring options — check the days of the week you want the schedule to apply to and optionally set an end date. Click Apply to selected date to save.

**Pending requests**

The right panel shows all pending booking requests from clients. Each card shows the client name, date, time, and service requested. Click Approve to confirm the booking. Click Decline to cancel it. The top card is flagged as the top match.

**Add Appointment Manually**

Below the pending requests is an Add Appointment Manually button. Use this when a client calls by phone or walks in. Click it to open a form. Fill in the client's first name, last name, email, phone, service, date, time, and optionally a treatment area and note. Click Confirm booking. The booking is created and immediately confirmed — it appears on the calendar right away.

If the client does not already have an account, one is created automatically using the email you provide.

**Clients**

Click Clients in the left sidebar to see the full client roster. Use the search bar to find a client by name or email. Click any row to open that client's profile.

**Client profile**

The profile page has four tabs.

The Bookings tab shows all appointments for that client. Confirmed bookings have Complete and No-show action buttons. Clicking No-show marks the booking and automatically creates a $20 no-show fee in the Fees tab.

The Sessions tab shows all logged session records. At the top of the tab is a form to log a new session. Fill in the date and time, add notes, click Add area to add one or more treatment areas each with their own intensity level, then click Save session.

The Photos tab lets you upload before, after, or progress photos for the client. Select the photo type and treatment area, then click the upload zone to choose a file. Uploaded photos appear in a grid below and are visible to the client in their portal. Click the X on any photo to delete it.

The Fees tab shows any outstanding no-show fees. Each fee can be marked as Paid or Waived. If waiving, you can enter a reason.

---

## Tech Stack

**Frontend** — Vanilla HTML, CSS, JavaScript split into modular files per feature. No framework.

**Backend** — FastAPI (Python), async REST API, JWT authentication, bcrypt password hashing.

**Database** — PostgreSQL on AWS RDS. Includes a trigger that automatically creates a $20 no-show fee record when a booking is marked no-show.

**Infrastructure** — AWS EC2 (backend), AWS RDS PostgreSQL (database), AWS S3 and CloudFront (frontend and CDN).

---

## Project Structure

```
premier-electrolysis/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── auth_utils.py
│   └── routers/
│       ├── auth.py
│       ├── bookings.py
│       ├── sessions.py
│       ├── clients.py
│       ├── photos.py
│       └── availability.py
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── client/
│   │   ├── index.html
│   │   ├── css/styles.css
│   │   └── js/
│   │       ├── auth.js
│   │       ├── booking.js
│   │       └── data.js
│   └── owner/
│       ├── index.html
│       ├── css/styles.css
│       └── js/
│           ├── auth.js
│           ├── calendar.js
│           ├── bookings.js
│           └── clients.js
└── schema.sql
```

---

Built by Ileana Pineda
