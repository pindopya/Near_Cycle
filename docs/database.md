# Database

Database ใช้ PostgreSQL และ Prisma ORM โดย schema หลักอยู่ที่ `backend/prisma/schema.prisma`

## Relations

```text
User
 ├── Donation[]
 └── Report[]

Donation
 ├── owner -> User
 ├── DonationImage[]
 └── Report[]

Report
 ├── reporter -> User
 └── donation -> Donation
```

## User

ข้อมูลหลัก:

- `id`
- `name`
- `email` — unique
- `passwordHash`
- `role` — `USER` หรือ `ADMIN`
- `isActive` — ใช้ระงับ/เปิดบัญชี
- `createdAt`, `updatedAt`

`ADMIN` ใช้หน้า Map และ feature ปกติเหมือน `USER` แต่มีสิทธิ์เข้า Admin Dashboard เพิ่ม

## Donation

ข้อมูลหลัก:

- `ownerId`
- `title`
- `description`
- `category`
- `quantity`
- `latitude`, `longitude`
- `address`
- `startDate`, `endDate`
- `status`
- `isHidden` — moderation state สำหรับ Admin
- `createdAt`, `updatedAt`

ค่า `startDate` / `endDate` ที่รับจากฟอร์มแบบ `YYYY-MM-DD` ใช้ขอบเขตวันของ `Asia/Bangkok` แล้วเก็บเป็น UTC: วันเริ่ม = 00:00:00 เวลาไทย และวันสิ้นสุด = 23:59:59.999 เวลาไทย

### Donation Status

- `AVAILABLE` — ของยังมีอยู่
- `OUT_OF_STOCK` — เจ้าของระบุว่าของหมดแล้ว
- `EXPIRED` — เลย `endDate`

โพสต์ที่แสดงบน Map ต้องผ่านทุกเงื่อนไข:

```text
status = AVAILABLE
isHidden = false
startDate <= now <= endDate
อยู่ภายในรัศมีที่ค้นหา
```

`isHidden` แยกจาก `status` เพื่อไม่ปะปนสถานะของบริจาคกับสถานะ moderation

## DonationImage

ข้อมูลหลัก:

- `donationId`
- `imageUrl`
- `createdAt`

ไฟล์จริงเก็บใน `backend/uploads/donations/` และ Database เก็บ URL ใน `DonationImage.imageUrl`

เมื่อลบรูปจะลบทั้ง record และไฟล์จริง เมื่อ Donation ถูกลบ relation จะลบ DonationImage/Report ที่เกี่ยวข้อง และ backend ลบไฟล์รูปออกจาก filesystem ด้วย

## Report

ข้อมูลหลัก:

- `reporterId`
- `donationId`
- `reason`
- `description`
- `status`
- `createdAt`, `updatedAt`

### Report Reason

- `ILLEGAL_ITEM`
- `DANGEROUS_ITEM`
- `FRAUD`
- `INAPPROPRIATE_CONTENT`
- `OTHER`

### Report Status

- `PENDING`
- `RESOLVED`

## Migration / Seed

Migration อยู่ที่ `backend/prisma/migrations/`

```bash
cd backend
npm run prisma:generate
npm run db:migrate
npm run db:seed
```

Seed สร้างบัญชี `USER` และ `ADMIN` สำหรับ local development โดยควรกำหนด `SEED_USER_PASSWORD` และ `SEED_ADMIN_PASSWORD` ผ่าน environment ก่อนรัน
