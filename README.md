# K Learning Hub

Unified CPA Review Learning Hub for FAR, AFAR, MAS, TAX, RFBT, and AUD.

## Current Student Setup

- Students can register with name, contact number, email, and password.
- Admin approval is required before access.
- Students can select subjects from the Subject navigation dropdown.
- Each subject has its own background color/theme.
- Students can read lessons, take quizzes, and review quiz history.
- Quiz credits cost ₱2 per question.
- Subscription features were removed for now and can be added later.

## Files

- `index.html` - website structure
- `style.css` - design and themes
- `script.js` - frontend logic
- `k-learning-logo.png` - logo
- `gcash-qr.jpg` - GCash QR image
- `backend/` - optional Node.js backend for Render deployment

## GitHub Pages

Upload the root files to GitHub and enable GitHub Pages from Settings → Pages.

## Backend

For full login, registration, payments, and saved data, deploy the `backend` folder to Render as a Web Service.

## LECPA Syllabus Content Update

This version integrates the six-subject LECPA structure based on PRBOA Resolution No. 30, s. 2022:

- FAR
- AFAR
- MAS / Management Services
- AUD
- RFBT
- TAX

The topic cards and lesson tabs include original CPA-review style discussions, key concepts, application notes, and review notes. These are original summaries for educational use and are not copied from copyrighted textbooks or review books.

## Security-Hardened Backend Notes

This version includes backend security improvements:

- Password hashing using PBKDF2 with salt
- Token-based login
- Backend-protected admin routes
- Basic rate limiting
- Duplicate GCash reference validation
- Receipt image validation and size limit
- Admin audit logs
- Root backend health routes: `/` and `/api/health`

### Render Environment Variables

Set these in Render before public use:

```env
NODE_ENV=production
FRONTEND_URL=https://kirkong-cloud.github.io
TOKEN_SECRET=replace-with-a-long-random-secret
TOKEN_TTL_HOURS=8
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=ChangeThisStrongPassword123!
ADMIN_NAME=Administrator
ENABLE_DEMO_ACCOUNTS=false
MAX_RECEIPT_BYTES=750000
```

Do not upload a real `.env` file to GitHub.

## Lesson Menu Tab Manager Update

The Admin Lesson Menu Tab section now shows the currently saved tabs for the selected topic immediately. After adding, editing, or deleting a tab, the current list and the actual topic lesson page are refreshed automatically.

Admin workflow:
1. Go to Admin Menu → Content Management → Lesson Menu Tabs.
2. Select a topic.
3. Existing additional tabs appear under Current Lesson Tabs for Selected Topic.
4. Use Add, Edit, Delete, Refresh Current Tabs, or Open Actual Topic View.

If using Render, redeploy the backend after uploading this version because lesson tab backend routes are required for online saving.

## Real Email OTP Update

The registration OTP is no longer displayed on the website. It is sent to the student's email through the Render backend.

Required Render environment variables:

```env
FRONTEND_URL=https://kirkong-cloud.github.io/K-Learning-Hub
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
OTP_FROM_EMAIL=your-email@gmail.com
```

After adding the environment variables, redeploy the Render Web Service.

## Lesson Menu Update

This version removes the built-in Main Discussion and Practice tabs from the actual student lesson menu. The lesson page now displays only the Lesson Menu Tabs created by the admin.

Admin improvements:
- Current Lesson Menu Tabs are visible after selecting a topic.
- Each Lesson Menu Tab can be edited or deleted.
- Each Lesson Menu Tab can now have Sub-Lesson Menu Tabs.
- Sub-Lesson Menu Tabs can be added, edited, and deleted.
- Content textareas include Bold, Italic, and Underline insert buttons.

Backend improvements:
- Lesson tabs now support nested `subtabs`.
- The existing topic and lesson tab endpoints preserve sub-lessons.


## Admin Login Fix / Render Setup

For Render deployment, add these Environment Variables so the backend always has a valid admin account:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin123!
ADMIN_NAME=Administrator
RESET_ADMIN_PASSWORD_ON_START=false
```

If you cannot login as admin after changing the password, temporarily set:

```env
RESET_ADMIN_PASSWORD_ON_START=true
```

Redeploy once, login, then set it back to `false` and redeploy again.

Default admin password for the packaged local/backend database is `Admin123!` including the exclamation point.
