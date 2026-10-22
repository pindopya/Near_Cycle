# Project Flow

ระบบยึดตาม `server-side-project-system.md` เท่านั้น

## Authentication

```text
Guest
  ↓
Map / Nearby Search / Donation Detail (Public)
  ├── ดูจุดบริจาคและรายละเอียดได้โดยไม่ต้อง Login
  └── เมื่อต้องทำ protected action → Register / Login
                                      ↓
                         Backend สร้าง JWT session ใน httpOnly cookie
                                      ↓
                               USER / ADMIN
```

การสร้าง Donation, แก้ไข/ลบโพสต์ของตัวเอง, อัปโหลดรูป และส่ง Report ต้อง Login ก่อน ส่วนหน้า Map, Nearby Search, Donation Detail และ Navigation เป็น public flow

`ADMIN` ยังใช้ระบบปกติเหมือน `USER` และมีปุ่ม Dashboard เพิ่ม

## Map / Nearby Search

```text
เปิดหน้า Map
    ↓
ขอ Location ปัจจุบัน
    ↓
กำหนดรัศมี + ประเภท (ถ้ามี)
    ↓
GET /api/donations/nearby
    ↓
Backend คัดเฉพาะ AVAILABLE + อยู่ในช่วงวันที่ + ไม่ถูกซ่อน
    ↓
คำนวณระยะทางจริง
    ↓
แสดง Marker บน Map
    ↓
กด Marker
    ↓
ดูข้อมูลเบื้องต้น
    ↓
เปิด Donation Detail
```

## Donation

```text
USER / ADMIN
    ↓
กด “+ บริจาค”
    ↓
กรอกข้อมูล + Location + วันที่
    ↓
POST /api/donations
    ↓
อัปโหลดรูป (ถ้ามี)
    ↓
Donation ถูกสร้าง
```
หากข้อมูล Donation ถูกบันทึกสำเร็จแล้วแต่การอัปโหลดรูปล้มเหลว ระบบจะแจ้งว่าโพสต์ถูกสร้าง/แก้ไขเรียบร้อยแล้วและให้ลองอัปโหลดเฉพาะรูปอีกครั้ง โดยไม่ยิง Create/PATCH ซ้ำ จึงไม่สร้าง Donation ซ้ำและไม่แสดง false failure ว่าข้อมูลหลักบันทึกไม่สำเร็จ

วันที่จากฟอร์มใช้เขตเวลา `Asia/Bangkok` โดยวันเริ่มเปิดบริจาคตั้งแต่ 00:00:00 และวันสิ้นสุดใช้งานได้ถึง 23:59:59.999 ของวันนั้น จากนั้น Backend แปลงเป็น UTC สำหรับเก็บและเปรียบเทียบเวลา

เจ้าของโพสต์สามารถแก้ไข ลบ เพิ่ม/ลบรูป และกด `ของหมดแล้ว`
เจ้าของโพสต์สามารถแก้ไข ลบ เพิ่ม/ลบรูป และกด `ของหมดแล้ว`

สถานะ:

```text
AVAILABLE
  ├── เจ้าของกดของหมดแล้ว → OUT_OF_STOCK
  └── now > endDate          → EXPIRED
```

เฉพาะ `AVAILABLE` ที่อยู่ในช่วง `startDate` ถึง `endDate` และไม่ถูก Admin ซ่อนจึงแสดงบน Map

## Donation Images
```text
เจ้าของ Donation
    ↓
เลือกรูป JPG / PNG / WEBP
    ↓
POST /api/donations/:id/images
    ↓
Backend ตรวจ ownership + MIME + file signature + ขนาด
    ↓
ตรวจจำนวนรูปเดิม + รูปใหม่ ต้องไม่เกิน 5 รูปรวมต่อ Donation
    ↓
บันทึกไฟล์ + DonationImage
```

ถ้าเกิน 5 รูปรวม ระบบ reject ทั้ง request โดยไม่เพิ่มรูปบางส่วน เมื่อลบรูปจะลบทั้ง record และไฟล์จริง การลบ Donation จะลบรูปที่เกี่ยวข้องทั้งหมดด้วย
## Navigation

```text
Donation Detail
    ↓
Frontend ตรวจว่า Donation ยัง AVAILABLE และอยู่ในช่วงวันที่
    ↓
กด “นำทางไปจุดบริจาค”
    ↓
อ่าน Location ปัจจุบัน
    ↓
GET /api/routes?donationId=&fromLat=&fromLng=
    ↓
Backend โหลด Donation จาก Database และตรวจ status / hidden / วันที่อีกครั้ง
    ↓
Backend ใช้พิกัดของ Donation จาก Database เป็นปลายทาง
    ↓
เรียก Routing Provider
    ↓
แสดงเส้นทาง + ระยะทาง + เวลาโดยประมาณบน Map
```

การเปิด URL `/donations/:id/navigate` ตรง ๆ จะไม่คำนวณเส้นทางถ้าเป็น `OUT_OF_STOCK`, `EXPIRED`, ยังไม่ถึงวันเริ่ม หรือเลยวันสิ้นสุด และ Backend จะตรวจซ้ำเพื่อไม่ให้ bypass ด้วยการเรียก API โดยตรง
ไม่มี Claim, Reservation และไม่มีขั้นตอนยืนยันหลังไปรับของ

## Report

```text
Donation Detail
    ↓
กด “รายงานโพสต์”
    ↓
Login (ถ้ายังไม่ได้ Login)
    ↓
เลือกเหตุผล + รายละเอียดเพิ่มเติม
    ↓
POST /api/donations/:id/reports
    ↓
สร้าง Report สถานะ PENDING
    ↓
รอ Admin ตรวจสอบ
```

## Admin Dashboard

```text
ADMIN
  ↓
หน้า Map เหมือน USER
  ↓
  ├── Donations
  │    ├── ดูรายละเอียดได้ทั้ง VISIBLE / HIDDEN
  │    ├── ดูรูป เจ้าของ และ Reports ที่เกี่ยวข้อง
  │    └── ซ่อน / แสดง / ลบ
  ├── Donations
  │    └── ซ่อน / แสดง / ลบ
  └── Reports
       ├── ดูรายละเอียด
       ├── RESOLVED
       ├── ซ่อน / ลบ Donation
       └── ระงับเจ้าของโพสต์
```

ทุก Admin endpoint ตรวจทั้ง Authentication และ Role ที่ Backend

## End-to-End Flow

```text
เข้าเว็บไซต์
    ↓
Map / Nearby Search (Public)
    ↓
Donation Detail
    ├── Navigation (Public)
    └── Protected actions → Register / Login
                              ├── USER / ADMIN: สร้าง Donation / Report / จัดการโพสต์ของตัวเอง
                              └── ADMIN: Dashboard / Admin Review
```

ระบบไม่มี workflow การจองของ ไม่มีการ claim สิ่งของ และไม่มี chat ตามขอบเขตของ source of truth
