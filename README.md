# OGTB Donation Map

Project วิชา Server-Side สำหรับลงจุดบริจาคบนแผนที่ ค้นหาจุดใกล้ตัว ดูรายละเอียด และนำทางไปยังจุดบริจาค โดยมี `USER` และ `ADMIN`

## Source of truth

Scope ระบบทั้งหมดต้องยึดตาม [`server-side-project-system.md`](./server-side-project-system.md) เท่านั้น ไม่เพิ่ม Claim, Reservation, Chat หรือขั้นตอนยืนยันการรับของนอกเหนือจาก spec

## Tech Stack

- Frontend: Next.js 16, React 19, React Leaflet, OpenStreetMap
- Backend: Node.js, Express.js 5
- Database: PostgreSQL + Prisma ORM
- Authentication: JWT ใน `httpOnly` cookie
- Routing: OSRM ผ่าน `ROUTING_BASE_URL`
- Image storage: local filesystem ที่ `backend/uploads/donations/`

## Project Structure

```text
server-side/
├── frontend/                 # Next.js
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/
├── backend/                  # Express.js
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── validators/
│   │   ├── utils/
│   │   └── config/
│   ├── prisma/
│   └── tests/
├── docs/
├── docker-compose.yml
├── .env.example
└── server-side-project-system.md
```

Backend flow หลักคือ `Request → Route → Middleware → Validator → Controller → Service → Prisma → PostgreSQL`

## Environment

สร้างไฟล์ `.env` ที่ root สำหรับ Docker Compose และคัดลอกไป `backend/.env` หากรัน Backend โดยตรง

```bash
cp .env.example .env
cp .env.example backend/.env
```

ค่าที่ Docker Compose อ่านจาก root `.env`:

- `FRONTEND_PORT` — host port ของ Frontend (ค่าเริ่มต้น `3000`)
- `BACKEND_PORT` — port ที่ Backend listen และ host publish (ค่าเริ่มต้น `4000`)
- `FRONTEND_URL` — origin ที่ Backend อนุญาตผ่าน CORS สำหรับกรณีเรียก Backend โดยตรง
- `NEXT_PUBLIC_API_URL` — optional; ปล่อยว่างเพื่อให้ browser เรียก `/api` และ `/uploads` ผ่าน Frontend แบบ same-origin ซึ่งเป็นค่าแนะนำ
- `JWT_SECRET`, `NODE_ENV`, `ROUTING_BASE_URL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`

Docker Compose จะให้ Next.js proxy `/api/*` และ `/uploads/*` ไป Backend service ภายในที่ port เดียวกับ `BACKEND_PORT` (ค่าเริ่มต้น `http://backend:4000`) ดังนั้นการทดสอบผ่าน HTTPS tunnel ใช้ URL Frontend เพียงตัวเดียวและ session cookie ไม่ต้องข้าม origin ถ้าจำเป็นต้องเรียก Backend URL โดยตรงค่อยกำหนด `NEXT_PUBLIC_API_URL` เอง

ถ้าเปลี่ยน Frontend port ให้ปรับ `FRONTEND_URL` ให้สัมพันธ์กัน เช่น `FRONTEND_PORT=3100` → `FRONTEND_URL=http://localhost:3100`
`DATABASE_URL` ใน `.env.example` ใช้สำหรับการรัน Backend โดยตรงบน host ส่วน Docker Compose ใช้ PostgreSQL service ชื่อ `db` ภายใน network ของ Compose จึงไม่ใช้ค่า `localhost` จาก root `.env`

ควรเปลี่ยน `JWT_SECRET`, `SEED_ADMIN_PASSWORD` และ `SEED_USER_PASSWORD` ก่อนใช้งานจริง โดย production จะบังคับให้ `JWT_SECRET` มีความยาวอย่างน้อย 32 ตัวอักษร

## Run with Docker Compose

รันระบบทั้งหมดได้ทันที:

```bash
docker compose up
```

Backend container จะรอให้ PostgreSQL healthy ก่อน แล้วรัน `prisma generate` และ `prisma migrate deploy` อัตโนมัติก่อนเปิด API ดังนั้น fresh clone / fresh database ไม่ต้องสร้าง schema ด้วยมือ
Docker แยก `node_modules` ของ Backend/Frontend และ `.next` ของ Frontend ไว้ใน named volumes เพื่อไม่ให้ package/native binary จาก Alpine container ไปทับ dependency ของ host

หากต้องการสร้าง seed account สำหรับทดสอบ ให้กำหนด `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD` ใน `.env` แล้วรัน:

```bash
docker compose exec backend npm run db:seed
```

เมื่อใช้ค่า default: Frontend คือ `http://localhost:3000` และ Backend health check คือ `http://localhost:4000/health`

## Run without Docker

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
npm run prisma:generate
npm run db:migrate
npm run dev
```

ต้องมี PostgreSQL ที่ตรงกับ `DATABASE_URL` เปิดอยู่ก่อน

## Main Features

- Register / Login / Logout และ Role `USER`, `ADMIN`
- Full-screen Map, current location, radius search และ category filter
- Donation CRUD, วันที่เปิด-ปิดตาม `Asia/Bangkok`, `AVAILABLE`, `OUT_OF_STOCK`, `EXPIRED`
- Upload / delete รูปภาพของ Donation สูงสุด 5 รูปรวมต่อโพสต์
- Navigation พร้อม route, ระยะทาง และเวลาโดยประมาณ โดย Backend ตรวจ Donation จาก Database และอนุญาตเฉพาะ `AVAILABLE` ที่อยู่ในช่วงวันที่
- Report Donation
- Admin Dashboard สำหรับ Users, Donations และ Reports รวม Donation Detail ที่เปิดดูโพสต์ซ่อนได้เฉพาะ Admin

## Testing

Backend:

```bash
cd backend
npm test
npm run test:coverage
```

Coverage gate:

- Lines ≥ 80%
- Functions ≥ 80%
- Branches ≥ 60%

Frontend:
Frontend:

```bash
cd frontend
npm test
npm run lint
npm run build
npm audit
```

Frontend ใช้ ESLint flat config (`eslint.config.mjs`) ร่วมกับ `eslint-config-next` และตั้ง `--max-warnings=0` เพื่อให้ lint เป็น quality gate จริงก่อน build
Frontend unit tests ครอบคลุม create/edit Donation กรณีข้อมูลหลักบันทึกสำเร็จแต่ image upload ล้มเหลว เพื่อยืนยันว่า retry จะอัปโหลดเฉพาะรูปและไม่สร้าง/แก้ข้อมูลซ้ำ
## Documentation

- [`docs/api-spec.md`](./docs/api-spec.md) — API endpoints และ validation behavior
- [`docs/database.md`](./docs/database.md) — Models, relations และสถานะ
- [`docs/project-flow.md`](./docs/project-flow.md) — User/Admin flows
- [`docs/architecture.md`](./docs/architecture.md) — Architecture, security และ testing

## Project Status

Phase 13 — Documentation & Final Review ✅

Implementation ครบตาม `server-side-project-system.md` และไม่มีระบบ Claim / Reservation / Chat เพิ่มเข้ามานอก spec
