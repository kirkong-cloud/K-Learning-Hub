# K Learning Hub Backend

Node.js + Express backend for K Learning Hub.

## Security updates included

- Passwords are stored as PBKDF2 salted hashes, not plain text.
- Token-based authentication is required for protected routes.
- Admin-only routes are protected on the backend, not only hidden in the frontend.
- Login, OTP, registration, and payment requests have basic rate limiting.
- Security headers are added.
- CORS can be restricted through `FRONTEND_URL`.
- Payment reference numbers are checked for duplicates.
- Receipt uploads are validated as image data and limited in size.
- Admin actions and sensitive events are recorded in `auditLogs`.
- Root health route added: `/` and `/api/health`.

## Install

```bash
npm install
```

## Run locally

```bash
npm start
```

## Important production environment variables

Set these in Render → Environment:

```env
NODE_ENV=production
FRONTEND_URL=https://kirkong-cloud.github.io
TOKEN_SECRET=use-a-long-random-secret
TOKEN_TTL_HOURS=8
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=ChangeThisStrongPassword123!
ADMIN_NAME=Administrator
ENABLE_DEMO_ACCOUNTS=false
```

Do **not** commit a real `.env` file to GitHub.

## Demo accounts

Demo accounts are no longer forced in production.

For local testing only, set:

```env
NODE_ENV=development
ENABLE_DEMO_ACCOUNTS=true
```

## Health check

```text
GET /
GET /api/health
```

## Key APIs

- `POST /api/auth/send-registration-otp`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/content`
- `POST /api/topics` admin only
- `PUT /api/topics/:id` admin only
- `POST /api/topics/:id/tabs` admin only
- `PUT /api/topics/:id/tabs/:tabId` admin only
- `DELETE /api/topics/:id/tabs/:tabId` admin only
- `POST /api/quizzes` admin only
- `PUT /api/quizzes/:id` admin only
- `GET /api/admin/quizzes` admin only
- `GET /api/admin/users` admin only
- `POST /api/admin/users/:id/approval` admin only
- `POST /api/admin/users/:id/add-quiz-credits` admin only
- `POST /api/payments/request` student only
- `GET /api/admin/payment-requests` admin only
- `POST /api/admin/payment-requests/:id/approve` admin only
- `GET /api/admin/audit-logs` admin only

## Next recommended upgrade

For public production use, migrate from `backend/data/database.json` to Supabase PostgreSQL with Row Level Security and Supabase Storage for receipt images.
