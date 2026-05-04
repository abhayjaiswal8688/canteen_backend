# Canteen Backend — Setup Guide

## Stack
- **Express** + **Mongoose** on Node 18+
- **MongoDB Atlas** (free M0 cluster)
- **JWT** auth (separate secrets for admin and students)
- **bcryptjs** for PIN and password hashing
- Deploy on **Render** (free tier)

---

## 1. MongoDB Atlas

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → create a free cluster
2. Under **Database Access** → create a user with readWrite on `canteen`
3. Under **Network Access** → allow `0.0.0.0/0` (Render uses dynamic IPs)
4. Get your connection string: `mongodb+srv://user:pass@cluster.mongodb.net/canteen`

---

## 2. Environment Variables

```bash
cp .env.example .env
```

Fill in each value:

```bash
# Generate ESP32 API key
openssl rand -hex 16

# Generate admin password hash (change 'yourpassword')
node -e "require('bcryptjs').hash('yourpassword',10).then(console.log)"

# Generate JWT secrets
openssl rand -hex 32   # for ADMIN_JWT_SECRET
openssl rand -hex 32   # for STUDENT_JWT_SECRET
```

---

## 3. Install & Run Locally

```bash
npm install
npm run dev   # nodemon server.js
```

Health check: `GET http://localhost:5000/health`

---

## 4. Deploy to Render

1. Push this folder to GitHub
2. Render → **New Web Service** → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add all env vars from `.env.example` in Render dashboard
6. Deploy — note your URL: `https://canteen-backend.onrender.com`

---

## 5. Seed a Test Student

```bash
curl -X POST https://your-render-url/api/students \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -d '{
    "name": "Raj Sharma",
    "rollNo": "CS2024001",
    "uid": "A3F2B19C",
    "pin": "1234",
    "password": "student123",
    "initialDeposit": 500
  }'
```

---

## 6. API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/admin/login` | None | Admin login → returns JWT |
| POST | `/api/auth/student/login` | None | Student login → returns JWT |
| POST | `/api/auth/student/change-password` | None | Student changes own password |

### ESP32 (X-API-Key header)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pay` | Deduct balance (uid + pin + amount) |
| GET | `/api/pay/balance/:uid` | Get balance by card UID |

### Admin Dashboard (Bearer JWT — admin role)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/students` | List all students |
| POST | `/api/students` | Register student (name, rollNo, uid, pin, password) |
| GET | `/api/students/:uid` | Get student by UID |
| PATCH | `/api/students/:uid` | Update name/status/pin/password |
| DELETE | `/api/students/:uid` | Suspend student |
| POST | `/api/students/:uid/topup` | Add funds (admin) |
| GET | `/api/students/topup-requests/pending` | All pending top-up requests |
| PATCH | `/api/students/:uid/topup-requests/:id` | Approve or reject request |
| GET | `/api/transactions` | Transaction log (filterable) |
| GET | `/api/transactions/stats` | Today's spend/topup stats |

### Student Portal (Bearer JWT — student role)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/students/me/profile` | Own profile + balance |
| GET | `/api/students/me/transactions` | Own transaction history |
| POST | `/api/students/me/topup-request` | Request top-up (admin approves) |
| GET | `/api/students/me/topup-requests` | Own request history |

---

## 7. ESP32 Config (config.h)

```cpp
#define API_BASE_URL  "https://your-render-url.onrender.com"
#define ESP32_API_KEY "your-esp32-api-key-from-env"
```

The ESP32 sends `X-API-Key: ESP32_API_KEY` on every request.
