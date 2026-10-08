# Security

## Reporting a vulnerability

If you find a security issue in AttendanceOS, report it privately to your organization's IT or engineering lead. Do not open a public GitHub issue for sensitive findings.

## Authentication

- API routes require a valid JWT (Bearer header or `portal_token` cookie).
- Inactive accounts cannot log in or use authenticated routes.
- Dashboard routes (`/admin/*`, `/employee/*`) are protected by Next.js middleware.

## Authorization

- Permissions are enforced on the **API**, not just the UI.
- Sensitive actions require explicit permissions (e.g. `employees:edit`, `payslips:manage`).
- Do not rely on hiding sidebar links as a security control.

## File uploads

- Files under `/uploads/` are **not** publicly served.
- Access is checked per file type (documents, CVs, policies, profile photos, etc.).
- Users must be logged in; document access is scoped to owner or authorized roles.

## Production checklist

- [ ] Set a strong `JWT_SECRET` (never use the example value).
- [ ] Set `ALLOWED_ORIGINS` to your frontend URL(s) only.
- [ ] Set `RATE_LIMIT_ENABLED=true` in production.
- [ ] Set `NEXT_PUBLIC_API_URL` to your backend URL (never rely on defaults).
- [ ] Do **not** run with `RUN_SEEDERS=true` in production after initial setup.
- [ ] Change default demo account passwords before go-live.
- [ ] Keep MongoDB credentials out of version control (`.env` only).

## Running security tests

```bash
cd backend
npm test                 # unit + integration
npm run test:integration # security integration tests only
```
