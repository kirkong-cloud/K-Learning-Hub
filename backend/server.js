const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "database.json");
const TOKEN_SECRET = process.env.TOKEN_SECRET || "change-this-secret-before-deployment";

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function createTrial(days = 30) {
  const start = new Date();
  const end = addDays(start, days);
  return {
    trialStartDate: start.toISOString(),
    trialEndDate: end.toISOString(),
    trialDays: days
  };
}

function slugify(value) {
  return String(value || "topic")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `topic-${Date.now()}`;
}


const SUBJECTS = ["FAR", "AFAR", "MAS", "TAX", "RFBT", "AUD"];
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + Number(months || 1)); return d; }
function activateSubscription(user, planType = "per_subject", subject = "FAR", months = 1) {
  user.subjectSubscriptions ||= {};
  const now = new Date();
  if (planType === "all_subjects") {
    const base = user.allSubjectsUntil && new Date(user.allSubjectsUntil) > now ? new Date(user.allSubjectsUntil) : now;
    user.allSubjectsUntil = addMonths(base, months).toISOString();
    user.subscriptionType = "all_subjects";
  } else {
    const safeSubject = SUBJECTS.includes(subject) ? subject : "FAR";
    const existing = user.subjectSubscriptions[safeSubject];
    const base = existing && new Date(existing) > now ? new Date(existing) : now;
    user.subjectSubscriptions[safeSubject] = addMonths(base, months).toISOString();
    user.subscriptionType = "per_subject";
  }
  return user;
}

function ensureTopicShape(topic) {
  topic.tabs = Array.isArray(topic.tabs) ? topic.tabs : [];
  return topic;
}

function normalizeLessonTabs(tabs = []) {
  return Array.isArray(tabs)
    ? tabs.filter(Boolean).map((tab, index) => ({
        id: String(tab.id || slugify(tab.title || `lesson-tab-${index + 1}`)).trim(),
        title: String(tab.title || "Untitled Lesson Tab").trim(),
        content: String(tab.content || "").trim(),
        createdAt: tab.createdAt || new Date().toISOString(),
        updatedAt: tab.updatedAt
      }))
    : [];
}

function getTrialStatus(user) {
  if (user.role === "admin") return { active: true, daysRemaining: null, message: "Admin account" };
  if (!user.trialEndDate) return { active: false, daysRemaining: 0, message: "No trial period assigned." };
  const ms = new Date(user.trialEndDate).getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  return {
    active: ms > 0,
    daysRemaining,
    trialStartDate: user.trialStartDate,
    trialEndDate: user.trialEndDate,
    trialDays: user.trialDays || 30,
    message: ms > 0 ? `${daysRemaining} day(s) remaining` : "Trial expired"
  };
}

function ensureTrialFields(user) {
  if (user.role === "student" && !user.trialEndDate) Object.assign(user, createTrial(30));
  return user;
}

function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (Date.now() > data.exp) return null;
  return data;
}

function readDatabase() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ topics: [], quizBank: [], scores: [], users: [], pendingOtps: [], paymentRequests: [], creditTransactions: [], professorProfile: {}, paymentSettings: { pricePerQuestion: 2, qrImagePath: "assets/gcash-qr.jpg" }, siteSettings: { announcement: "Welcome to the Learning Hub. Check your quiz credits and continue your lessons regularly." } }, null, 2));
  }
  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  db.topics ||= [];
  db.quizBank ||= [];
  db.scores ||= [];
  db.users ||= [];
  db.pendingOtps ||= [];
  db.paymentRequests ||= [];
  db.creditTransactions ||= [];
  db.paymentSettings ||= { pricePerQuestion: 2, qrImagePath: "assets/gcash-qr.jpg" };
  db.siteSettings ||= { announcement: "Welcome to the Learning Hub. Check your quiz credits and continue your lessons regularly." };
  db.professorProfile ||= {
    name: "Professor Name",
    position: "Professor / Instructor",
    subject: "Financial Accounting and Reporting",
    email: "professor@email.com",
    consultationHours: "Monday to Friday, 3:00 PM – 5:00 PM",
    philosophy: "To help students understand accounting concepts through clear discussions, practical computations, and interactive assessment.",
    photoLabel: "Photo"
  };
  let changed = false;
  db.topics = db.topics.map(topic => {
    if (!Array.isArray(topic.tabs)) changed = true;
    return ensureTopicShape(topic);
  });

  const seedUsers = [
    { email: "admin@example.com", password: "Admin123!", role: "admin", name: "Admin", contactNumber: "" },
    { email: "student@example.com", password: "Student123!", role: "student", name: "Student Demo", contactNumber: "09123456789" }
  ];
  for (const seed of seedUsers) {
    if (!db.users.some(u => u.email === seed.email)) {
      db.users.push({
        id: uuidv4(),
        name: seed.name || "",
        contactNumber: seed.contactNumber || "",
        email: seed.email,
        passwordHash: hashPassword(seed.password),
        role: seed.role,
        approvalStatus: "approved",
        approvedBy: "system",
        approvedAt: new Date().toISOString(),
        ...(seed.role === "student" ? { ...createTrial(30), quizCredits: 0, subscriptionType: "all_subjects", allSubjectsUntil: addMonths(new Date(), 1).toISOString(), subjectSubscriptions: {} } : {}),
        createdAt: new Date().toISOString()
      });
      changed = true;
    }
  }
  for (const user of db.users) {
    const beforeTrial = user.trialEndDate;
    const beforeApproval = user.approvalStatus;
    ensureTrialFields(user);
    if (!user.approvalStatus) user.approvalStatus = "approved"; // migrate existing accounts as approved
    if (user.role === "admin") user.approvalStatus = "approved";
    if (user.role === "student" && typeof user.quizCredits !== "number") { user.quizCredits = Number(user.quizCredits || 0); changed = true; }
    if (user.role === "student") { user.subjectSubscriptions ||= {}; user.subscriptionType ||= "per_subject"; }
    if (user.trialEndDate !== beforeTrial || user.approvalStatus !== beforeApproval) changed = true;
  }

  db.quizBank = db.quizBank.map((question, index) => {
    const updated = {
      id: question.id || uuidv4(),
      reviewStatus: question.reviewStatus || "approved",
      adminNotes: question.adminNotes || "",
      ...question
    };
    if (!question.id || !question.reviewStatus) changed = true;
    return updated;
  });

  if (changed) writeDatabase(db);
  return db;
}

function writeDatabase(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}


function findStudentForPayment(db, request) {
  const requestUserId = String(request.userId || request.linkedUserId || "").toLowerCase();
  const requestEmail = String(request.email || "").toLowerCase();
  return db.users.find(u => u.role === "student" && (
    String(u.id || "").toLowerCase() === requestUserId ||
    String(u.email || "").toLowerCase() === requestEmail
  ));
}

function syncPaymentCredits(db, request, adminEmail) {
  const user = findStudentForPayment(db, request);
  if (!user) {
    return { ok: false, status: 404, error: "Student account not found for this payment request." };
  }

  const requestedCredits = Math.max(1, Number(request.itemCount || request.creditsAdded || 0));
  if (request.planType === "per_subject" || request.planType === "all_subjects") {
    activateSubscription(user, request.planType, request.subject, Number(request.months || 1));
    request.subscriptionApplied = true;
    request.subscriptionSyncedAt = new Date().toISOString();
    return { ok: true, status: 200, user, addedNow: 0, message: `${request.planType === "all_subjects" ? "All Subjects" : request.subject} subscription activated for ${Number(request.months || 1)} month(s).` };
  }
  const existingTransaction = (db.creditTransactions || []).find(t => t.paymentRequestId === request.id);

  request.status = "paid_approved";
  request.creditsAdded = requestedCredits;
  request.linkedUserId = user.id;
  request.creditSyncedAt = new Date().toISOString();
  request.creditSyncedBy = adminEmail;

  if (existingTransaction) {
    request.creditsApplied = Number(existingTransaction.credits || requestedCredits);
    return {
      ok: true,
      addedNow: 0,
      user,
      message: `Credits were already applied for this request. Current credits for ${user.name || user.email}: ${Number(user.quizCredits || 0)}.`
    };
  }

  user.quizCredits = Math.max(0, Number(user.quizCredits || 0) + requestedCredits);
  user.updatedAt = new Date().toISOString();
  request.creditsApplied = requestedCredits;
  db.creditTransactions ||= [];
  db.creditTransactions.push({
    id: uuidv4(),
    paymentRequestId: request.id,
    userId: user.id,
    email: user.email,
    credits: requestedCredits,
    createdAt: new Date().toISOString(),
    createdBy: adminEmail
  });

  return {
    ok: true,
    addedNow: requestedCredits,
    user,
    message: `${requestedCredits} quiz credit(s) added to ${user.name || user.email}. Current credits: ${Number(user.quizCredits || 0)}.`
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name || "",
    contactNumber: user.contactNumber || "",
    email: user.email,
    role: user.role,
    approvalStatus: user.approvalStatus || "approved",
    approvedBy: user.approvedBy || null,
    approvedAt: user.approvedAt || null,
    createdAt: user.createdAt || null,
    quizCredits: Number(user.quizCredits || 0),
    subscriptionType: user.subscriptionType || "per_subject",
    allSubjectsUntil: user.allSubjectsUntil || "",
    subjectSubscriptions: user.subjectSubscriptions || {},
    ...getTrialStatus(user)
  };
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: "Login required." });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin access only." });
  next();
}

function requireActiveTrial(req, res, next) {
  if (req.user?.role === "admin") return next();
  const db = readDatabase();
  const fullUser = db.users.find(u => u.id === req.user.id);
  const status = getTrialStatus(fullUser || req.user);
  if (!status.active) return res.status(403).json({ error: "Your 30-day trial has expired. Please contact the admin to add more days.", trialStatus: status });
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "K Learning Hub - FAR API is running" });
});


app.post("/api/auth/send-registration-otp", (req, res) => {
  const name = String(req.body.name || "").trim();
  const contactNumber = String(req.body.contactNumber || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!name) return res.status(400).json({ error: "Student name is required." });
  if (!contactNumber) return res.status(400).json({ error: "Contact number is required." });
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email address is required." });
  if (!isStrongPassword(password)) return res.status(400).json({ error: "Password must have at least 8 characters, uppercase, lowercase, and number." });

  const db = readDatabase();
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: "Email already registered." });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  db.pendingOtps = (db.pendingOtps || []).filter(item => item.email !== email && new Date(item.expiresAt).getTime() > Date.now());
  db.pendingOtps.push({
    email,
    otp,
    name,
    contactNumber,
    passwordHash: hashPassword(password),
    expiresAt: addDays(new Date(), 0).getTime ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  });
  writeDatabase(db);

  // Demo/development note: this returns otpPreview so you can test without an email/SMS provider.
  // In production, send the OTP through an email service such as Gmail SMTP, SendGrid, or Resend and remove otpPreview.
  res.json({ message: "OTP generated. Enter the 6-digit OTP to continue registration.", otpPreview: otp });
});

app.post("/api/auth/register", (req, res) => {
  const name = String(req.body.name || "").trim();
  const contactNumber = String(req.body.contactNumber || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const otp = String(req.body.otp || "").trim();
  const role = "student";

  if (!name) return res.status(400).json({ error: "Student name is required." });
  if (!contactNumber) return res.status(400).json({ error: "Contact number is required." });
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email address is required." });
  if (!isStrongPassword(password)) return res.status(400).json({ error: "Password must have at least 8 characters, uppercase, lowercase, and number." });
  if (!otp) return res.status(400).json({ error: "Email OTP is required." });

  const db = readDatabase();
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: "Email already registered." });
  const pending = (db.pendingOtps || []).find(item => item.email === email && item.otp === otp);
  if (!pending) return res.status(400).json({ error: "Invalid OTP." });
  if (new Date(pending.expiresAt).getTime() <= Date.now()) return res.status(400).json({ error: "OTP expired. Please request a new OTP." });

  const user = {
    id: uuidv4(),
    name,
    contactNumber,
    email,
    passwordHash: pending.passwordHash || hashPassword(password),
    role,
    approvalStatus: "pending_approval",
    emailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
    ...(role === "student" ? createTrial(30) : {}),
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  db.pendingOtps = (db.pendingOtps || []).filter(item => item.email !== email);
  writeDatabase(db);
  res.status(201).json({
    user: publicUser(user),
    message: "Email verified and registration submitted. Please wait for admin approval before logging in."
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const db = readDatabase();
  const user = db.users.find(u => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "Invalid email or password." });
  if (user.role === "student" && user.approvalStatus !== "approved") {
    return res.status(403).json({ error: "Your account is still pending admin approval. Please wait for the admin to approve your registration.", user: publicUser(user) });
  }
  res.json({ token: makeToken(user), user: publicUser(user) });
});


app.get("/api/me", requireAuth, (req, res) => {
  const db = readDatabase();
  const user = db.users.find(u => u.id === req.user.id || u.email === req.user.email);
  if (!user) return res.status(404).json({ error: "User account not found." });
  res.json(publicUser(user));
});

app.get("/api/content", requireAuth, (req, res) => {
  const db = readDatabase();
  const quizBank = req.user.role === "admin" ? db.quizBank : db.quizBank.filter(q => (q.reviewStatus || "approved") === "approved");
  res.json({ topics: db.topics, quizBank, professorProfile: db.professorProfile, siteSettings: db.siteSettings });
});

app.get("/api/topics", requireAuth, requireActiveTrial, (req, res) => {
  res.json(readDatabase().topics);
});

app.post("/api/topics", requireAuth, requireAdmin, (req, res) => {
  const title = String(req.body.title || "").trim();
  const discussion = String(req.body.discussion || "").trim();
  if (!title || !discussion) {
    return res.status(400).json({ error: "Topic title and discussion are required." });
  }

  const db = readDatabase();
  let id = String(req.body.id || slugify(title)).trim();
  if (db.topics.some(topic => topic.id === id)) id = `${id}-${Date.now()}`;

  const topic = ensureTopicShape({
    id,
    title,
    standard: "",
    summary: "",
    discussion,
    formula: "",
    computation: "",
    tabs: Array.isArray(req.body.tabs) ? req.body.tabs : [],
    createdBy: req.user.email,
    createdAt: new Date().toISOString()
  });

  db.topics.push(topic);
  writeDatabase(db);
  res.status(201).json(topic);
});

app.put("/api/topics/:id", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const topic = db.topics.find(item => item.id === req.params.id);
  if (!topic) return res.status(404).json({ error: "Topic not found" });

  topic.title = req.body.title ?? topic.title;
  topic.standard = "";
  topic.summary = "";
  topic.discussion = req.body.discussion ?? topic.discussion;
  topic.computation = "";
  topic.formula = "";
  topic.tabs = Array.isArray(req.body.tabs) ? normalizeLessonTabs(req.body.tabs) : normalizeLessonTabs(topic.tabs || []);
  topic.updatedAt = new Date().toISOString();

  writeDatabase(db);
  res.json(ensureTopicShape(topic));
});



app.post("/api/topics/:id/tabs", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const topic = ensureTopicShape(db.topics.find(item => item.id === req.params.id));
  if (!topic) return res.status(404).json({ error: "Topic not found" });

  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();
  if (!title || !content) return res.status(400).json({ error: "Tab title and content are required." });

  let id = String(req.body.id || slugify(title)).trim();
  if (topic.tabs.some(tab => tab.id === id)) id = `${id}-${Date.now()}`;
  const tab = { id, title, content, createdAt: new Date().toISOString() };
  topic.tabs.push(tab);
  topic.updatedAt = new Date().toISOString();
  writeDatabase(db);
  res.status(201).json({ topic: ensureTopicShape(topic), tab });
});

app.put("/api/topics/:id/tabs/:tabId", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const topic = ensureTopicShape(db.topics.find(item => item.id === req.params.id));
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  const tab = topic.tabs.find(item => item.id === req.params.tabId);
  if (!tab) return res.status(404).json({ error: "Lesson tab not found" });

  const title = String(req.body.title || tab.title || "").trim();
  const content = String(req.body.content || tab.content || "").trim();
  if (!title || !content) return res.status(400).json({ error: "Tab title and content are required." });

  tab.title = title;
  tab.content = content;
  tab.updatedAt = new Date().toISOString();
  topic.updatedAt = new Date().toISOString();
  writeDatabase(db);
  res.json({ topic: ensureTopicShape(topic), tab });
});

app.delete("/api/topics/:id/tabs/:tabId", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const topic = ensureTopicShape(db.topics.find(item => item.id === req.params.id));
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  const existing = topic.tabs.find(item => item.id === req.params.tabId);
  if (!existing) return res.status(404).json({ error: "Lesson tab not found" });

  topic.tabs = topic.tabs.filter(item => item.id !== req.params.tabId);
  topic.updatedAt = new Date().toISOString();
  writeDatabase(db);
  res.json({ message: "Lesson tab deleted successfully.", topic: ensureTopicShape(topic), deletedTabId: req.params.tabId });
});


app.delete("/api/topics/:id", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const existing = db.topics.find(item => item.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Topic not found" });

  db.topics = db.topics.filter(item => item.id !== req.params.id);
  db.quizBank = db.quizBank.filter(question => question.topic !== req.params.id);
  writeDatabase(db);
  res.json({ message: "Topic deleted successfully.", deletedTopicId: req.params.id });
});

app.get("/api/quizzes", requireAuth, (req, res) => {
  const { topic, type, difficulty } = req.query;
  let quizzes = readDatabase().quizBank;

  if (req.user.role !== "admin") quizzes = quizzes.filter(q => (q.reviewStatus || "approved") === "approved");
  if (topic && topic !== "all") quizzes = quizzes.filter(q => q.topic === topic);
  if (type && type !== "mixed") quizzes = quizzes.filter(q => q.type === type);
  if (difficulty && difficulty !== "all") quizzes = quizzes.filter(q => q.difficulty === difficulty);

  res.json(quizzes);
});

app.post("/api/quizzes", requireAuth, requireAdmin, (req, res) => {
  const { topic, type, difficulty, question, choices, answer, explanation, answerFormula, answerExpression, variables, solutionTemplate } = req.body;

  if (!topic || !type || !difficulty || !question || !explanation) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const newQuestion = {
    id: uuidv4(),
    topic,
    type,
    difficulty,
    question,
    choices: Array.isArray(choices) ? choices : [],
    answer: answerFormula ? "" : (answer || ""),
    explanation,
    answerFormula: answerFormula || undefined,
    answerExpression: answerFormula === "custom" ? answerExpression : undefined,
    variables: variables || undefined,
    solutionTemplate: solutionTemplate || undefined,
    reviewStatus: "pending_review",
    adminNotes: "",
    createdBy: req.user.email,
    createdAt: new Date().toISOString()
  };

  const db = readDatabase();
  db.quizBank.push(newQuestion);
  writeDatabase(db);
  res.status(201).json(newQuestion);
});

app.get("/api/admin/quizzes", requireAuth, requireAdmin, (req, res) => {
  const { topic, type, status } = req.query;
  let quizzes = readDatabase().quizBank;

  if (topic && topic !== "all") quizzes = quizzes.filter(q => q.topic === topic);
  if (type && type !== "all") quizzes = quizzes.filter(q => q.type === type);
  if (status && status !== "all") quizzes = quizzes.filter(q => (q.reviewStatus || "approved") === status);

  res.json(quizzes);
});

app.put("/api/quizzes/:id", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const question = db.quizBank.find(item => item.id === req.params.id);
  if (!question) return res.status(404).json({ error: "Question not found." });

  const allowedStatuses = ["pending_review", "approved", "needs_revision"];
  if (req.body.reviewStatus && !allowedStatuses.includes(req.body.reviewStatus)) {
    return res.status(400).json({ error: "Invalid review status." });
  }

  question.topic = req.body.topic ?? question.topic;
  question.type = req.body.type ?? question.type;
  question.difficulty = req.body.difficulty ?? question.difficulty;
  question.question = req.body.question ?? question.question;
  question.choices = Array.isArray(req.body.choices) ? req.body.choices : question.choices;
  question.answer = req.body.answer ?? question.answer;
  question.explanation = req.body.explanation ?? question.explanation;
  question.answerFormula = req.body.answerFormula ?? question.answerFormula;
  question.answerExpression = req.body.answerExpression ?? question.answerExpression;
  question.variables = req.body.variables ?? question.variables;
  question.solutionTemplate = req.body.solutionTemplate ?? question.solutionTemplate;
  question.reviewStatus = req.body.reviewStatus ?? question.reviewStatus ?? "pending_review";
  question.adminNotes = req.body.adminNotes ?? question.adminNotes ?? "";
  question.reviewedBy = req.body.reviewStatus ? req.user.email : question.reviewedBy;
  question.reviewedAt = req.body.reviewStatus ? new Date().toISOString() : question.reviewedAt;
  question.updatedAt = new Date().toISOString();

  if (!question.question || !question.explanation || (!question.answerFormula && !question.answer)) {
    return res.status(400).json({ error: "Question, correct answer/formula, and explanation are required." });
  }

  if (question.answerFormula === "custom" && !question.answerExpression) {
    return res.status(400).json({ error: "Custom formula questions require an answerExpression, such as A - B or MIN(A, B)." });
  }

  writeDatabase(db);
  res.json(question);
});

app.delete("/api/quizzes/:id", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const before = db.quizBank.length;
  db.quizBank = db.quizBank.filter(item => item.id !== req.params.id);
  if (db.quizBank.length === before) return res.status(404).json({ error: "Question not found." });
  writeDatabase(db);
  res.json({ success: true });
});


app.post("/api/payments/request", requireAuth, (req, res) => {
  if (req.user.role !== "student") return res.status(400).json({ error: "Only student accounts can submit payment requests." });
  const itemCount = Math.max(1, Number(req.body.itemCount || 0));
  if (!Number.isFinite(itemCount) || itemCount <= 0) return res.status(400).json({ error: "Enter a valid number of quiz items." });
  const db = readDatabase();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Student account not found." });
  const price = Number(db.paymentSettings?.pricePerQuestion || 2);
  const reference = String(req.body.reference || "").trim();
  const receiptData = String(req.body.receiptData || "").trim();
  const receiptFileName = String(req.body.receiptFileName || "").trim();
  if (!reference && !receiptData) return res.status(400).json({ error: "Please provide a GCash reference number or upload a receipt screenshot." });
  if (receiptData && !receiptData.startsWith("data:image/")) return res.status(400).json({ error: "Receipt screenshot must be an image file." });
  const request = {
    id: uuidv4(),
    userId: user.id,
    name: user.name || "",
    email: user.email,
    itemCount,
    amount: itemCount * price,
    reference,
    receiptData,
    receiptFileName,
    status: "pending_payment",
    createdAt: new Date().toISOString()
  };
  db.paymentRequests.push(request);
  writeDatabase(db);
  res.status(201).json(request);
});

app.get("/api/admin/payment-requests", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  res.json(db.paymentRequests || []);
});

app.post("/api/admin/payment-requests/:id/approve", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const request = (db.paymentRequests || []).find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Payment request not found." });
  if (request.status !== "pending_payment" && request.status !== "paid_approved") {
    return res.status(400).json({ error: "Only pending or approved payment requests can be synced." });
  }

  if (!request.approvedAt) request.approvedAt = new Date().toISOString();
  request.approvedBy = req.user.email;

  const sync = syncPaymentCredits(db, request, req.user.email);
  if (!sync.ok) return res.status(sync.status || 400).json({ error: sync.error });

  writeDatabase(db);
  res.json({
    request,
    user: publicUser(sync.user),
    creditsAdded: sync.addedNow,
    message: sync.message
  });
});

app.post("/api/admin/payment-requests/:id/reapply-credits", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const request = (db.paymentRequests || []).find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Payment request not found." });
  if (request.status !== "paid_approved") return res.status(400).json({ error: "Credits can only be re-applied for approved payment requests." });

  const sync = syncPaymentCredits(db, request, req.user.email);
  if (!sync.ok) return res.status(sync.status || 400).json({ error: sync.error });

  writeDatabase(db);
  res.json({
    request,
    user: publicUser(sync.user),
    creditsAddedNow: sync.addedNow,
    message: sync.message
  });
});

app.post("/api/admin/payment-requests/:id/reject", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const request = (db.paymentRequests || []).find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Payment request not found." });
  if (request.status !== "pending_payment") return res.status(400).json({ error: "Only pending payment requests can be rejected." });
  request.status = "rejected";
  request.rejectedBy = req.user.email;
  request.rejectedAt = new Date().toISOString();
  writeDatabase(db);
  res.json(request);
});

app.post("/api/me/use-quiz-credits", requireAuth, (req, res) => {
  const itemCount = Math.max(1, Number(req.body.itemCount || 0));
  if (!Number.isFinite(itemCount) || itemCount <= 0) return res.status(400).json({ error: "Enter a valid number of quiz items." });
  const db = readDatabase();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (user.role === "admin") return res.json({ user: publicUser(user), message: "Admin account does not use quiz credits." });
  const trial = getTrialStatus(user);
  if (trial.active) return res.json({ user: publicUser(user), message: "Active trial; no paid credits used." });
  if (Number(user.quizCredits || 0) < itemCount) return res.status(403).json({ error: "Insufficient quiz credits. Please pay per question or ask the admin to add trial days.", user: publicUser(user) });
  user.quizCredits = Number(user.quizCredits || 0) - itemCount;
  user.updatedAt = new Date().toISOString();
  writeDatabase(db);
  res.json({ user: publicUser(user), used: itemCount });
});

app.post("/api/scores", requireAuth, (req, res) => {
  const db = readDatabase();
  const scoreRecord = {
    id: uuidv4(),
    studentEmail: req.user.email,
    studentName: req.user.name || "Student",
    score: req.body.score,
    total: req.body.total,
    percentage: req.body.percentage,
    reviewItems: Array.isArray(req.body.reviewItems) ? req.body.reviewItems : [],
    createdAt: new Date().toISOString()
  };
  db.scores.push(scoreRecord);
  writeDatabase(db);
  res.status(201).json(scoreRecord);
});

app.get("/api/my-scores", requireAuth, (req, res) => {
  const db = readDatabase();
  const myScores = (db.scores || [])
    .filter(score => score.studentEmail === req.user.email)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json(myScores);
});

app.get("/api/scores", requireAuth, requireAdmin, (req, res) => {
  res.json(readDatabase().scores);
});


app.put("/api/admin/professor-profile", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const profile = {
    name: String(req.body.name || "Professor Name").trim(),
    position: String(req.body.position || "Professor / Instructor").trim(),
    subject: String(req.body.subject || "Financial Accounting and Reporting").trim(),
    email: String(req.body.email || "professor@email.com").trim(),
    consultationHours: String(req.body.consultationHours || "Monday to Friday, 3:00 PM – 5:00 PM").trim(),
    philosophy: String(req.body.philosophy || "").trim(),
    photoLabel: String(req.body.photoLabel || "Photo").trim(),
    photoData: String(req.body.photoData || "").trim(),
    updatedBy: req.user.email,
    updatedAt: new Date().toISOString()
  };
  db.professorProfile = profile;
  writeDatabase(db);
  res.json(profile);
});



app.put("/api/admin/site-settings", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  db.siteSettings ||= {};
  db.siteSettings.announcement = String(req.body.announcement || "").trim();
  db.siteSettings.updatedBy = req.user.email;
  db.siteSettings.updatedAt = new Date().toISOString();
  writeDatabase(db);
  res.json(db.siteSettings);
});

app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  res.json(db.users.map(publicUser));
});

app.post("/api/admin/users/:id/approval", requireAuth, requireAdmin, (req, res) => {
  const status = String(req.body.approvalStatus || "");
  const allowedStatuses = ["pending_approval", "approved", "rejected"];
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid approval status." });

  const db = readDatabase();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (user.role === "admin") return res.status(400).json({ error: "Admin accounts are already approved." });

  user.approvalStatus = status;
  user.updatedAt = new Date().toISOString();
  if (status === "approved") {
    user.approvedBy = req.user.email;
    user.approvedAt = new Date().toISOString();
  }

  writeDatabase(db);
  res.json(publicUser(user));
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const userIndex = db.users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) return res.status(404).json({ error: "User not found." });

  const user = db.users[userIndex];
  if (user.role === "admin") return res.status(400).json({ error: "Admin accounts cannot be deleted here." });

  const approval = user.approvalStatus || "approved";
  const trialExpired = user.trialEndDate ? new Date(user.trialEndDate).getTime() <= Date.now() : false;
  const canDelete = approval === "rejected" || approval === "approved" || trialExpired;
  if (!canDelete) {
    return res.status(400).json({ error: "Only rejected, approved, or expired student accounts can be removed." });
  }

  db.users.splice(userIndex, 1);
  writeDatabase(db);
  res.json({ success: true, message: "Student email removed successfully." });
});

app.post("/api/admin/users/:id/add-trial-days", requireAuth, requireAdmin, (req, res) => {
  const daysToAdd = Number(req.body.days || 0);
  if (!Number.isFinite(daysToAdd) || daysToAdd <= 0) return res.status(400).json({ error: "Enter a valid number of days to add." });

  const db = readDatabase();
  const targetId = decodeURIComponent(req.params.id || "");
  const user = db.users.find(u => u.id === targetId || u.email === targetId);
  if (!user) return res.status(404).json({ error: "Student not found." });
  if (user.role !== "student") return res.status(400).json({ error: "Trial days can only be added to student accounts." });

  ensureTrialFields(user);
  const currentEnd = new Date(user.trialEndDate);
  const baseDate = currentEnd > new Date() ? currentEnd : new Date();
  user.trialEndDate = addDays(baseDate, daysToAdd).toISOString();
  user.trialDays = Number(user.trialDays || 30) + daysToAdd;
  user.updatedAt = new Date().toISOString();

  writeDatabase(db);
  res.json(publicUser(user));
});

app.post("/api/admin/users/:id/add-quiz-credits", requireAuth, requireAdmin, (req, res) => {
  const creditsToAdd = Number(req.body.credits || 0);
  if (!Number.isFinite(creditsToAdd) || creditsToAdd <= 0) return res.status(400).json({ error: "Enter a valid number of quiz credits to add." });

  const db = readDatabase();
  const targetId = decodeURIComponent(req.params.id || "");
  const user = db.users.find(u => u.id === targetId || u.email === targetId);
  if (!user) return res.status(404).json({ error: "Student not found." });
  if (user.role !== "student") return res.status(400).json({ error: "Quiz credits can only be added to student accounts." });

  user.quizCredits = Number(user.quizCredits || 0) + creditsToAdd;
  user.updatedAt = new Date().toISOString();

  writeDatabase(db);
  res.json({ user: publicUser(user), creditsAdded: creditsToAdd, message: `${creditsToAdd} quiz credit(s) added to ${user.name || user.email}. Current credits: ${Number(user.quizCredits || 0)}.` });
});


app.post("/api/admin/users/:id/add-subscription", requireAuth, requireAdmin, (req, res) => {
  const db = readDatabase();
  const user = db.users.find(u => u.id === req.params.id || u.email === req.params.id);
  if (!user || user.role !== "student") return res.status(404).json({ error: "Student not found." });
  const planType = req.body.planType === "all_subjects" ? "all_subjects" : "per_subject";
  const subject = req.body.subject || "FAR";
  const months = Math.max(1, Number(req.body.months || 1));
  activateSubscription(user, planType, subject, months);
  writeDatabase(db);
  res.json({ user: publicUser(user), message: `${planType === "all_subjects" ? "All Subjects" : subject} subscription added for ${months} month(s).` });
});

app.post("/api/admin/users/:id/reduce-trial-days", requireAuth, requireAdmin, (req, res) => {
  const daysToReduce = Number(req.body.days || 0);
  if (!Number.isFinite(daysToReduce) || daysToReduce <= 0) return res.status(400).json({ error: "Enter a valid number of days to reduce." });

  const db = readDatabase();
  const targetId = decodeURIComponent(req.params.id || "");
  const user = db.users.find(u => u.id === targetId || u.email === targetId);
  if (!user) return res.status(404).json({ error: "Student not found." });
  if (user.role !== "student") return res.status(400).json({ error: "Trial days can only be reduced for student accounts." });

  ensureTrialFields(user);
  const currentEnd = user.trialEndDate ? new Date(user.trialEndDate) : new Date();
  user.trialEndDate = addDays(currentEnd, -daysToReduce).toISOString();
  user.trialDays = Math.max(0, Number(user.trialDays || 30) - daysToReduce);
  user.updatedAt = new Date().toISOString();

  writeDatabase(db);
  res.json({ user: publicUser(user), daysReduced: daysToReduce, message: `${daysToReduce} trial day(s) reduced from ${user.name || user.email}. New trial end: ${new Date(user.trialEndDate).toLocaleDateString()}.` });
});

app.post("/api/admin/users/:id/reduce-quiz-credits", requireAuth, requireAdmin, (req, res) => {
  const creditsToReduce = Number(req.body.credits || 0);
  if (!Number.isFinite(creditsToReduce) || creditsToReduce <= 0) return res.status(400).json({ error: "Enter a valid number of quiz credits to reduce." });

  const db = readDatabase();
  const targetId = decodeURIComponent(req.params.id || "");
  const user = db.users.find(u => u.id === targetId || u.email === targetId);
  if (!user) return res.status(404).json({ error: "Student not found." });
  if (user.role !== "student") return res.status(400).json({ error: "Quiz credits can only be reduced for student accounts." });

  user.quizCredits = Math.max(0, Number(user.quizCredits || 0) - creditsToReduce);
  user.updatedAt = new Date().toISOString();

  writeDatabase(db);
  res.json({ user: publicUser(user), creditsReduced: creditsToReduce, message: `${creditsToReduce} quiz credit(s) reduced from ${user.name || user.email}. Current credits: ${Number(user.quizCredits || 0)}.` });
});

app.listen(PORT, () => {
  console.log(`K Learning Hub - FAR API running on port ${PORT}`);
});
