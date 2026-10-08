# AttendanceOS — Deployment Guide

## Current Status

| Service | Status | URL |
|---|---|---|
| GitHub | ✅ Pushed | https://github.com/your-org/workforceos-portal |
| Render (Backend) | ⚠️ Failing | https://attendance-portal-yvhf.onrender.com |
| Vercel (Frontend) | ⏳ Not started | — |

---

## Fix Render Deployment (Do This Now)

The backend is failing because Render needs to be pointed at the `backend/` subdirectory.

### Step 1 — Set Root Directory in Render

1. Go to https://dashboard.render.com
2. Click your service `attendance-portal`
3. Go to **Settings** tab
4. Find **Root Directory** → set it to: `backend`
5. Find **Build Command** → set it to: `npm install`
6. Find **Start Command** → set it to: `npm start`
7. Click **Save Changes**

### Step 2 — Set Environment Variables

Go to **Environment** tab in Render and add these:

| Variable | Value |
|---|---|
| `MONGO_URI` | `mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/workforceos?retryWrites=true&w=majority` |
| `JWT_SECRET` | `workforceos_2026_secret_key_abc123` |
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `RATE_LIMIT_MAX` | `2000` |
| `RATE_LIMIT_WINDOW_MS` | `900000` |
| `CLIENT_URL` | _(deprecated alias — use `ALLOWED_ORIGINS` below)_ |
| `ALLOWED_ORIGINS` | Your frontend URL(s), comma-separated, e.g. `https://portal.example.com,https://www.portal.example.com` |

### Step 3 — Manual Deploy

1. Go to **Deploys** tab
2. Click **Deploy latest commit**
3. Watch the logs — it should show:
   ```
   Connected to MongoDB
   Roles seeded
   Leave types seeded
   Cafe menus seeded
   Leave allocations seeded
   Server running on port 10000
   ```

### Step 4 — Verify Backend is Live

Open in browser: `https://attendance-portal-yvhf.onrender.com/api/auth/login`

You should see a JSON response (even an error like "method not allowed" means it's working).

---

## Deploy Frontend on Vercel

Do this after Render is confirmed working.

### Step 1 — Import Project

1. Go to https://vercel.com → **New Project**
2. Import from GitHub: `your-org/workforceos-portal`
3. Set **Root Directory** to: `nextjs-frontend`
4. Framework: Next.js (auto-detected)

### Step 2 — Add Environment Variable

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://attendance-portal-yvhf.onrender.com/api` |

### Step 3 — Deploy

Click **Deploy**. Vercel will build and give you a URL like `attendance-portal.vercel.app`.

### Step 4 — Update Render ALLOWED_ORIGINS

Go back to Render → Environment → set `ALLOWED_ORIGINS` to your exact frontend URL (no trailing slash):

```
https://your-app.vercel.app
```

If you use both `www` and non-`www`, include both comma-separated.
Restart the backend after saving.

---

## Login Credentials (After Deploy)

| Role | Employee ID | Password |
|---|---|---|
| Admin | MAS-288 | (your password) |

---

## Troubleshooting

**Render still failing after setting Root Directory?**
- Check the logs for the line just before "Exited with status 1"
- Common causes: missing env var, MongoDB connection refused, port binding issue
- Make sure `MONGO_URI` is set correctly in Render Environment tab

**Frontend shows "Network Error" or blank page?**
- Check `NEXT_PUBLIC_API_URL` is set in Vercel project settings
- Make sure it ends with `/api` (no trailing slash)
- Verify Render backend is running first

**CORS errors in browser console?**
- Login/API calls are proxied server-side by Next.js — the browser should **not** hit the backend directly.
- Ensure the frontend runs as a **Node.js app** (`npm run build` then `npm start`), not as static HTML only.
- On the frontend server, set `BACKEND_URL` to your backend (no `/api` suffix), e.g. `https://attendance-portal-yvhf.onrender.com`
- Restart the frontend after changing env vars.
- On the backend, set `ALLOWED_ORIGINS` to your frontend URL (still required for any direct API calls).
- Check backend logs on startup — it prints `CORS allowed origins: ...`

```bash
# Frontend server (.env or environment)
BACKEND_URL=https://your-backend-domain.com

cd nextjs-frontend
npm run build
npm start
```
