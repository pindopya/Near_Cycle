# Architecture

โปรเจกต์แยก Frontend และ Backend ชัดเจน โดยยึดโครงสร้างที่กำหนดไว้ตั้งแต่ต้น

```text
frontend/                 Next.js
backend/                  Express.js
  src/
    routes/
    controllers/
    services/
    middleware/
    validators/
    utils/
    config/
  prisma/
  tests/
docs/
```

## Backend Request Flow

```text
Request
  ↓
Route
  ↓
Middleware
  ↓
Validator
  ↓
Controller
  ↓
Service
  ↓
Prisma
  ↓
PostgreSQL
```

Controller รับ/ส่ง HTTP response ส่วน business logic หลักอยู่ใน Service และ Database access ผ่าน Prisma

## Frontend Routes

- `/` — Map + Nearby Search
- `/login`, `/register` — Authentication
- `/donations/new` — สร้าง Donation
- `/donations/[id]` — Donation Detail + owner actions
- `/donations/[id]/edit` — แก้ไข Donation / รูป
- `/donations/[id]/navigate` — Navigation
- `/donations/[id]/report` — Report
- `/admin` — Dashboard
- `/admin/users` — User management
- `/admin/donations` — Donation moderation
- `/admin/donations/[id]` — Admin Donation Detail + related reports/actions
- `/admin/reports` และ `/admin/reports/[id]` — Report review

## Map / Routing

Frontend ใช้ React Leaflet + OpenStreetMap สำหรับแผนที่

Nearby Search คำนวณรัศมีจาก Location ปัจจุบัน โดย Backend ใช้ bounding box เพื่อลดชุดข้อมูลเบื้องต้น แล้วคำนวณระยะจริงด้วย Haversine ก่อนตอบกลับ

Navigation เรียก Routing Provider จาก Backend ผ่าน `ROUTING_BASE_URL` และส่งกลับ route geometry, distance และ duration โดยไม่เก็บ route ลง Database

## Image Storage

รูป Donation เก็บ local ที่ `backend/uploads/donations/` และเก็บ URL ใน PostgreSQL ผ่าน `DonationImage`

สำหรับ scope ของวิชา Server-Side วิธีนี้เพียงพอ แต่หาก deploy แบบหลาย instance จะต้องเปลี่ยนไปใช้ shared/object storage ซึ่งไม่อยู่ใน scope ปัจจุบัน

## Docker / Environment

Docker Compose รับ host/application config จาก root `.env`: `FRONTEND_PORT`, `BACKEND_PORT`, `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, `JWT_SECRET`, `NODE_ENV`, `ROUTING_BASE_URL` และ seed passwords โดยค่า port เริ่มต้นยังเป็น Frontend `3000` / Backend `4000`
ค่าแนะนำคือปล่อย `NEXT_PUBLIC_API_URL` ว่าง เพื่อให้ browser เรียก `/api/*` และ `/uploads/*` แบบ same-origin ผ่าน Next.js rewrite จากนั้น Frontend container จะ proxy ไปยัง `http://backend:${BACKEND_PORT:-4000}` ภายใน Compose network จึงใช้ port เดียวกับ Backend service เสมอ วิธีนี้ทำให้ session cookie ทำงานกับ HTTPS tunnel โดยไม่ต้องพึ่ง cross-origin cookie
ถ้าเปลี่ยน Frontend host port ให้เปลี่ยน `FRONTEND_URL` ให้เป็น origin เดียวกัน ส่วน `DATABASE_URL` สำหรับ Docker ถูกกำหนดเป็น PostgreSQL service `db` ภายใน Compose network; ค่า `DATABASE_URL` แบบ `localhost` ใน `.env.example` ใช้ตอนรัน Backend บน host โดยตรง
Compose แยก `backend/node_modules`, `frontend/node_modules` และ `frontend/.next` ไปไว้ใน named volumes เพื่อป้องกัน native dependency จาก Alpine container ปนกับ dependency/build cache ของ host
## Authentication / Authorization

- JWT เก็บใน `httpOnly` cookie ชื่อ `ogtb_session`
- JWT มี issuer, audience และวันหมดอายุ
- Protected endpoint อ่าน User จาก Database ทุกครั้ง
- User ที่ `isActive = false` ใช้ session เดิมต่อไม่ได้
- Ownership ของ Donation/Image ตรวจที่ Backend
- `/api/admin/*` ตรวจทั้ง Authentication และ `ADMIN` role
- Admin ไม่สามารถระงับบัญชีตัวเอง

## Validation & Security

- `httpOnly`, `SameSite=Lax` cookie และ `Secure` เมื่อ production
- Production บังคับ `JWT_SECRET` อย่างน้อย 32 ตัวอักษร
- CORS อนุญาตตาม `FRONTEND_URL`
- Helmet security headers และปิด `X-Powered-By`
- Global API rate limit + limit เฉพาะ Auth และ Report
- JSON body สูงสุด 1 MB
- malformed JSON → `400 INVALID_JSON`
- payload ใหญ่เกิน → `413 PAYLOAD_TOO_LARGE`
- rate limit เกิน → `429 TOO_MANY_REQUESTS`
- Donation validation ครอบคลุมข้อความ จำนวน พิกัด ช่วงวันที่ และวันที่ปฏิทินจริง
- Upload จำกัด JPG/PNG/WEBP, ไม่เกิน 5 MB/รูป, สูงสุด 5 รูปต่อ request และสูงสุด 5 รูปรวมต่อ Donation พร้อมตรวจ file signature
- Unexpected error ไม่ส่ง stack trace กลับ client

## Testing

Backend ใช้ Node.js built-in test runner และรันแบบ `--test-concurrency=1` เพื่อไม่ให้ integration tests ที่ใช้ Database เดียวกันชนกัน

```bash
cd backend
npm test
npm run test:coverage
```

Coverage gate:

- Lines ≥ 80%
- Functions ≥ 80%
- Branches ≥ 60%

Repository ปัจจุบันมี Backend test cases 77 cases

เอกสารนี้ไม่ตรึงค่า pass/coverage snapshot เพื่อไม่ให้ตัวเลขเก่าเมื่อเพิ่ม test ใหม่ โดยให้ `npm test` และ `npm run test:coverage` เป็น source of truth ของผลทดสอบและ coverage ล่าสุด

System-flow test ครอบคลุม `Register → Donation → Nearby Search → Report → Admin Review → Hide Donation → Suspend User`

Frontend ใช้ ESLint flat config + `eslint-config-next` โดย `npm run lint` รันด้วย `--max-warnings=0` และตรวจต่อด้วย production build / HTTP smoke test; `npm audit` ฝั่ง Frontend ไม่พบ vulnerability

## Dependency Audit Note

`npm audit` ฝั่ง Backend ยังรายงาน 4 high severity advisories ใน dependency chain ของ Prisma CLI (`@prisma/config` → `deepmerge-ts` / `mysql2`) โดยคำสั่งแก้อัตโนมัติที่ npm เสนอเป็น `npm audit fix --force` ซึ่งจะ downgrade Prisma 7 ไป Prisma 6 และเป็น breaking change จึงไม่ได้บังคับแก้ในรอบนี้ ต้องติดตาม Prisma release ที่แก้ dependency chain นี้แทน

## Final Scope Review

ตรวจ implementation เทียบ `server-side-project-system.md` แล้ว:

- Authentication ✅
- Map ✅
- Donation + Status ✅
- Search / Filter ✅
- Navigation ✅
- Report ✅
- Admin Dashboard ✅
- USER / ADMIN role ✅
- ไม่มี Claim / Reservation / Chat / Pickup Confirmation ✅

ไฟล์ `backend/src/routes/user.routes.js` และ `backend/src/controllers/user.controller.js` ถูกคงไว้ตามโครงสร้างโปรเจกต์ที่กำหนด แต่ไม่ได้ mount endpoint เพิ่ม เพราะ source of truth ใช้ `/api/auth/me` สำหรับข้อมูลผู้ใช้ปัจจุบันและไม่ได้กำหนด User/Profile module แยก
