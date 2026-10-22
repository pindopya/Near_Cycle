# API Spec

API ทั้งหมดต้องยึดตาม `server-side-project-system.md`

## Authentication

| Method | Endpoint | Description | Access | Success |
| --- | --- | --- | --- | ---: |
| POST | `/api/auth/register` | สมัครสมาชิกและสร้าง session | Public | 201 |
| POST | `/api/auth/login` | Login และสร้าง session | Public | 200 |
| POST | `/api/auth/logout` | ล้าง session cookie | Public | 204 |
| GET | `/api/auth/me` | ดูข้อมูลผู้ใช้ที่ Login อยู่ | USER / ADMIN | 200 |

ระบบใช้ JWT ใน `httpOnly` cookie ชื่อ `ogtb_session` และรองรับ `Authorization: Bearer <token>` สำหรับการเรียก API โดยตรง

Role มีเพียง `USER` และ `ADMIN` โดย ADMIN ใช้ feature ปกติได้เหมือน USER

## Donation

| Method | Endpoint | Description | Access | Success |
| --- | --- | --- | --- | ---: |
| GET | `/api/donations` | ดูรายการ Donation ที่ไม่ถูกซ่อน | Public | 200 |
| GET | `/api/donations/nearby?lat=&lng=&radius=&category=` | ค้นหาจุดที่แสดงบน Map | Public | 200 |
| GET | `/api/donations/:id` | ดู Donation Detail พร้อมรูป | Public | 200 |
| POST | `/api/donations` | สร้าง Donation | USER / ADMIN | 201 |
| POST | `/api/donations/:id/images` | อัปโหลดรูป field `images` | Owner | 201 |
| PATCH | `/api/donations/:id` | แก้ไข Donation | Owner | 200 |
| PATCH | `/api/donations/:id/out-of-stock` | ระบุว่าของหมดแล้ว | Owner | 200 |
| DELETE | `/api/donations/:id/images/:imageId` | ลบรูป Donation | Owner | 204 |
| DELETE | `/api/donations/:id` | ลบ Donation | Owner | 204 |

ข้อมูลหลักของ Donation:

- `title`
- `description`
- `category`
- `quantity`
- `latitude`, `longitude`
- `address`
- `startDate`, `endDate`

เมื่อส่งค่าแบบ `YYYY-MM-DD` ระบบตีความเป็นวันตามเขตเวลา `Asia/Bangkok`: `startDate` เริ่ม 00:00:00 และ `endDate` สิ้นสุด 23:59:59.999 ของวันนั้น ก่อนแปลงเป็น UTC เพื่อเก็บในฐานข้อมูล

สถานะมี `AVAILABLE`, `OUT_OF_STOCK`, `EXPIRED`

### Donation Images

- รองรับ JPG, PNG, WEBP
- จำกัด 5 MB ต่อรูป
- สูงสุด 5 รูปรวมต่อ Donation และสูงสุด 5 รูปต่อ request
- ถ้า `จำนวนรูปเดิม + รูปใหม่ > 5` ตอบ `400 TOO_MANY_DONATION_IMAGES` โดยไม่เพิ่มรูปบางส่วน
- ตรวจทั้ง MIME type และ file signature
- URL เปิดอ่านผ่าน `/uploads/donations/<filename>`
- เพิ่ม/ลบรูปได้เฉพาะเจ้าของ Donation

### Nearby Search

`GET /api/donations/nearby` รับ:

- `lat` — latitude ปัจจุบัน
- `lng` — longitude ปัจจุบัน
- `radius` — กิโลเมตร ค่าเริ่มต้น 5 สูงสุด 500
- `category` — optional, case-insensitive

ผลลัพธ์ต้องผ่าน:

```text
status = AVAILABLE
isHidden = false
startDate <= now <= endDate
อยู่ภายใน radius
```

Response มี `distanceKm` เพิ่มสำหรับหน้า Map

## Navigation

| Method | Endpoint | Description | Access | Success |
| --- | --- | --- | --- | ---: |
| GET | `/api/routes?donationId=&fromLat=&fromLng=` | คำนวณเส้นทางจากตำแหน่งปัจจุบันไป Donation ที่ยังรับของได้ | Public | 200 |

Backend ใช้ `donationId` เป็น source of truth สำหรับปลายทาง โดยอ่าน `latitude/longitude` ของ Donation จาก Database เอง ไม่รับปลายทางจาก client

ก่อนเรียก Routing Provider ต้องผ่านทุกเงื่อนไข:

- `status = AVAILABLE`
- `isHidden = false`
- `startDate <= now <= endDate`

ถ้า Donation หมด, หมดอายุ หรือยังไม่ถึงวันเริ่ม จะตอบ `409 DONATION_NOT_AVAILABLE`; ถ้าถูกซ่อนหรือไม่มี Donation จะตอบ `404 DONATION_NOT_FOUND`

Response หลัก:

- `distanceMeters`
- `durationSeconds`
- `geometry` — GeoJSON LineString
- `steps`

Backend เรียก Routing Provider ผ่าน `ROUTING_BASE_URL` ค่าเริ่มต้นคือ OSRM public service และไม่เก็บ route ลง Database

| Method | Endpoint | Description | Access | Success |
| --- | --- | --- | --- | ---: |
| POST | `/api/donations/:id/reports` | ส่ง Report ให้ Admin ตรวจสอบ | USER / ADMIN | 201 |

Reason:

- `ILLEGAL_ITEM`
- `DANGEROUS_ITEM`
- `FRAUD`
- `INAPPROPRIATE_CONTENT`
- `OTHER`

`description` เป็น optional สูงสุด 1000 ตัวอักษร และ Report ใหม่เป็น `PENDING`

## Admin

ทุก endpoint ใต้ `/api/admin` ต้องผ่าน Authentication และ `ADMIN` role

| Method | Endpoint | Description | Access | Success |
| --- | --- | --- | --- | ---: |
| GET | `/api/admin/users` | ดู Users ทั้งหมด | ADMIN | 200 |
| PATCH | `/api/admin/users/:id/status` | ระงับ/เปิดบัญชีด้วย `isActive` | ADMIN | 200 |
| GET | `/api/admin/donations` | ดู Donations ทั้งหมดรวมโพสต์ซ่อน | ADMIN | 200 |
| GET | `/api/admin/donations/:id` | ดู Donation Detail สำหรับ Admin รวมโพสต์ที่ถูกซ่อนและ Reports | ADMIN | 200 |
| PATCH | `/api/admin/donations/:id/visibility` | ซ่อน/แสดง Donation | ADMIN | 200 |
| DELETE | `/api/admin/donations/:id` | ลบ Donation | ADMIN | 204 |
| GET | `/api/admin/reports` | ดู Reports ทั้งหมด | ADMIN | 200 |
| GET | `/api/admin/reports/:id` | ดู Report Detail | ADMIN | 200 |
| PATCH | `/api/admin/reports/:id` | เปลี่ยน `PENDING` / `RESOLVED` | ADMIN | 200 |

ก่อนตอบข้อมูล Admin ที่มี Donation ระบบจะ refresh โพสต์ `AVAILABLE` ที่เลย `endDate` ให้เป็น `EXPIRED` เพื่อให้ Dashboard แสดงสถานะล่าสุด


## Error / Security Behavior

- Validation ผิด → `400`
- malformed JSON → `400 INVALID_JSON`
- ไม่มี/หมดอายุ session → `401`
- role หรือ ownership ไม่ถูกต้อง → `403`
- resource ไม่พบ → `404`
- payload เกิน 1 MB → `413 PAYLOAD_TOO_LARGE`
- rate limit เกิน → `429 TOO_MANY_REQUESTS`
- Routing Provider มีปัญหา → `502 ROUTING_UNAVAILABLE`
- Routing Provider timeout หลัง retry → `504 ROUTING_TIMEOUT`
- Internal error → `500` โดยไม่ส่ง stack trace กลับ client

ระบบไม่มี Claim / Reservation endpoint ตาม source of truth
