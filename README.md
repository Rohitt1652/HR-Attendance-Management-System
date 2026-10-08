# WorkforceOS — Smart HR & Attendance Management System

A full-stack enterprise HR, Attendance, Payroll & Workforce management system built with **Next.js 16**, **Node.js + Express**, and **MongoDB Atlas**.

## Project Structure

```
workforceos-portal/
├── backend/          ← Express API server (Node.js + MongoDB)
├── nextjs-frontend/  ← Next.js 16 App Router frontend
└── frontend/         ← (Legacy Vite+React — not in use)
```

## Quick Start

### 1. Backend
```bash
cd backend
npm install
# Copy .env.example to .env and fill in your MongoDB URI
cp .env.example .env
npm run seed  # Optional: Seeds default roles, departments & demo records
npm run dev
# Runs on http://localhost:5000
```

### 2. Frontend
```bash
cd nextjs-frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

## Demo & Default Accounts (Password: `Password@123`)

| Role | Email | Employee ID | Name |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@xps.com` | `EMP-0001` | Rajesh Sharma |
| **Managing Director** | `md@xps.com` | `EMP-0002` | Vikram Malhotra |
| **HR Manager** | `hr@xps.com` | `EMP-0003` | Pooja Verma |
| **Team Lead** | `tl.eng@xps.com` | `EMP-0004` | Amit Kumar |
| **Employee** | `rahul@xps.com` | `EMP-0006` | Rahul Singh |

## Features

### Admin
- 📊 Dashboard with real-time attendance stats, birthdays, holidays, cafe menu
- 👥 User management (Employee, Team Lead, HR, Admin, MD roles)
- ⏰ Attendance tracking with late mark detection
- 🌴 Leave management — types, allocation by role, approve/reject
- 📋 Performance reviews with radar charts
- 💰 Payslip generation and publishing
- 📢 Announcements with role targeting
- 📅 Calendar with custom events
- 📁 Document management with verification
- 🛡️ Roles & Permissions matrix
- ☕ Cafe menu (day-wise)
- 🎉 Holiday calendar
- 📈 Reports (daily/monthly/export CSV/Excel/PDF)

### Employee
- 🏠 Dashboard with check-in/out, birthdays, holidays, cafe menu
- 📋 My Attendance with calendar view
- 🌴 Leave application (Full Day / Half Day / Hourly) with balance
- 📊 My Performance with radar chart and trend
- 💰 My Payslips
- 📁 My Documents
- 📢 Announcements
- 🔔 Real-time notifications

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | Next.js 16, App Router, Tailwind CSS v4, Recharts |
| Backend  | Node.js, Express, Mongoose |
| Database | MongoDB Atlas |
| Auth     | JWT + bcrypt (+ `portal_token` cookie for file access) |
| Storage  | Local `uploads/` directory (auth-protected) |

## Environment variables

Copy `backend/.env.example` to `backend/.env` and `nextjs-frontend/.env.local` for local dev.

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Signing key for auth tokens |
| `ALLOWED_ORIGINS` | Comma-separated frontend URLs for CORS |
| `NEXT_PUBLIC_API_URL` | Backend URL for Next.js API proxy |
| `RUN_SEEDERS` | Set `true` only when seeding a fresh database |
| `RATE_LIMIT_ENABLED` | Enable API rate limiting (use `true` in production) |

## Testing

```bash
# Backend (unit + security integration)
cd backend && npm test

# Frontend
cd nextjs-frontend && npm test

# All dependencies
npm run install:all
```

## Security

See [SECURITY.md](./SECURITY.md) for production checklist and how to report issues.

## Legacy code

The `frontend/` folder is an unused Vite+React app. **Use `nextjs-frontend/` only.**
