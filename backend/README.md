# K Learning Hub - FAR Backend

Node.js + Express backend for login, admin-approved student registration, role-based access, topics, quizzes, and scores.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

## Default Demo Accounts

The server automatically creates these accounts on first run:

- Admin: `admin@example.com` / `Admin123!`
- Student: `student@example.com` / `Student123!`

## API Summary

- `POST /api/auth/register` creates a pending student account
- `POST /api/auth/login`
- `GET /api/content` requires login
- `PUT /api/topics/:id` requires admin
- `POST /api/quizzes` requires admin
- `POST /api/scores` requires login
- `GET /api/scores` requires admin

## Environment Variables

Copy `.env.example` to `.env` and update the values.

## Admin Quiz Review APIs

- `GET /api/admin/quizzes` - Admin-only list of all questions, including pending and revision items.
- `PUT /api/quizzes/:id` - Admin-only update for question text, choices, answer, explanation, notes, and review status.
- `DELETE /api/quizzes/:id` - Admin-only delete question.

New questions are saved as `pending_review`. Students only receive questions with `reviewStatus: "approved"`.


## Student Registration Approval API

- `GET /api/admin/users` - Admin-only list of student accounts, including approval and trial status.
- `POST /api/admin/users/:id/approval` - Admin-only update of approval status. Use `approved`, `pending_approval`, or `rejected`.

Pending or rejected students cannot log in until an admin approves them.

## Payment / Quiz Credit API

Added endpoints:

- `POST /api/payments/request` — student submits quiz item payment request.
- `GET /api/admin/payment-requests` — admin views all requests.
- `POST /api/admin/payment-requests/:id/approve` — admin marks payment as received and credits the student.
- `POST /api/admin/payment-requests/:id/reject` — admin rejects payment request.
- `POST /api/me/use-quiz-credits` — deducts quiz credits when expired-trial students generate a quiz.

Default rate is **₱5 per quiz item**.

## Latest Update: Student Quiz History

The backend now stores detailed quiz review records through `/api/scores` and allows a logged-in student to retrieve their own history through:

```text
GET /api/my-scores
```

Each saved score can include `reviewItems` for answer review.
