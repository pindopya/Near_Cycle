# Recycling Drop Points importer (isolated)
ข้อมูลจาก `WON Drop Points.pdf` 31 จุด และข้อมูลจุดรับ Trash Lucky อีก 20 จุดจาก https://trashlucky.com/dropoffs/ รวม 51 จุดใน `points.json`. ข้อมูลเก่าเก็บครบทุก field
ไม่แก้ Prisma schema, API, UI, routes, migration หรือข้อมูลเดิม

## Commands (ที่ root ของ repository)
```bash
# หา candidate coordinates จาก OpenStreetMap Nominatim (ต้องต่ออินเทอร์เน็ต)
node backend/scripts/won-import/geocode.mjs

# Validation สามารถรันผ่าน Node บนเครื่องได้โดยไม่ต้องเปิด Docker
node backend/scripts/won-import/import.mjs --validate

# Dry-run ใช้ dependencies กับ DATABASE_URL ใน backend container
docker-compose exec -T backend node scripts/won-import/import.mjs --validate
docker-compose exec -T backend node scripts/won-import/import.mjs --dry-run

# เขียนฐานข้อมูล: เฉพาะ importApproved=true, มีพิกัดในประเทศไทย และเปิดรับประชาชน
docker-compose exec -T backend node scripts/won-import/import.mjs --apply --confirm
```

## ความปลอดภัยและการตรวจสอบ
- สคริปต์ Geocoding เก็บผลลง `points.json` เป็น `geoStatus: candidate` ไม่ตั้งเป็น approved อัตโนมัติ
- การอนุมัตินำเข้า (`importApproved`) แยกจาก `geoStatus`; ข้อมูล 8 จุดแบบ `approximate` ไม่ได้ผ่านการยืนยันพิกัดจุดรับจริง
- จุดที่ `requiresManualReview: true` อาจถูกนำเข้าเมื่อได้รับอนุมัติ แต่คำเตือนยังอยู่ในรายละเอียด และไม่ได้ยืนยันประเภทขยะหรือจุดตั้งกล่อง
- #28 ไม่ใช่จุดสาธารณะ จึง `publicAccess: false` และถูกกันไว้เสมอจนกว่าจะมีหลักฐานใหม่
- #30 มี 4 จุดย่อย แต่ source 1 แถว จึงไม่แตกเป็น 4 พิกัดโดยไม่มีหลักฐาน
- คำอธิบายบางจุดเป็นข้อมูลระดับแคมเปญ/โครงการ ไม่ใช่การยืนยันที่จุดรับ; สคริปต์เก็บข้อความนี้ตาม PDF
- พิกัดถนน/ตำบล/มหาวิทยาลัยยังคง `candidate` หรือ `approximate`; ไม่แปลงเป็น verified โดยไม่มีหลักฐาน
- Public Nominatim: จำกัด 1 request/s, ระบุ User-Agent, จำกัดการนำเข้าเป็นกลุ่มครั้งเดียว ไม่ใช้เป็นบริการ lookup แบบต่อเนื่อง; เช็ค usage policy อีกครั้งก่อนรันซ้ำ
- หลังอนุมัติเมื่อ 11 พ.ย. 2026 นำเข้า 30/31 รายการ โดยคงความไม่แน่นอนของพิกัดและข้อมูลจุดรับไว้; #28 ไม่ถูกนำเข้า

## Mapping ชั่วคราว (ไม่แก้ระบบ)
- Donation.title = ชื่อจุด
- Donation.category = `WON Drop Point` (ID 1–31) หรือ `Trash Lucky Drop Point` (ID 32–51)
- Donation.description = โครงการ, เงื่อนไขวัสดุ, รายละเอียด และ key `[WON-DROP-POINT:NN]` หรือ `[TRASH-LUCKY-DROP-POINT:NN]` สำหรับกันซ้ำ
- Donation.address/latitude/longitude = ที่อยู่ตามแหล่งข้อมูล และพิกัดอ้างอิงจาก OSM (ยังไม่ยืนยันตำแหน่งถังจริง)
- Donation.ownerId = บัญชี service `won-import@near-cycle.local` ที่สร้างเฉพาะตอนมีรายการใหม่ใน `--apply --confirm`
- Donation.quantity = 1 (placeholder ที่ schema บังคับ **ไม่ใช่จำนวนวัสดุจริง**)
- Donation.startDate = วันรัน, endDate = อีก 1 ปี (อายุรายการชั่วคราว ไม่ใช่เวลาปิดจุดรับ)
- status = AVAILABLE หมายถึง record ยังไม่หมดอายุใน schema ปัจจุบันเท่านั้น ไม่ใช่การยืนยันสถานะจุดรับ

## ความปลอดภัยการนำเข้า
- `--validate` ไม่มี DB access, `--dry-run` อ่าน DB แต่ไม่เขียน
- `--apply --confirm` ต้องใช้ด้วยกัน; ขาด `--confirm` จะไม่เขียน
- ตรวจและข้าม record ที่มี import key เดิม ไม่แตะโพสต์ผู้ใช้อื่น
- transaction สำหรับการเพิ่มใหม่ในรอบเดียว (ไม่ควรรัน concurrent สองรอบพร้อมกัน เพราะ schema ไม่มี unique key สำหรับ import key)
- ไม่อัปเดต record ที่เคย import; หากข้อมูลหรือพิกัดเปลี่ยน ต้องตรวจสอบขั้นตอนแก้ไขแยก

## หมายเหตุ
พิกัดทั้งหมดเป็น reference coordinates ที่ยังไม่ได้ตรวจกล่องรับจริง; WON เดิมมี 8 จุดเป็น approximate และอาจคลาดเคลื่อนมาก. จุด Trash Lucky 20 จุดเป็นพิกัดสถานที่หรืออาคาร ไม่ใช่พิกัดถัง. Import ได้รับอนุญาตแล้วโดยเก็บคำเตือนใน description. ก่อนใช้เพื่อนำทางควรตรวจสถานที่จริง.

## Geocode Review Report
\`node backend/scripts/won-import/review.mjs\` สร้าง \`geocode-review.md\` พร้อมลิงก์ตรวจพิกัดทั้ง 51 แห่ง

## เพิ่มเติม 20 จุด Trash Lucky
- รายการ #32–#51 อยู่ใน `points.json` เดิม แยก category และ import key เพื่อไม่ทับข้อมูล WON
- ที่มาจุดรับ: https://trashlucky.com/dropoffs/ ; พิกัดอาคารหรือสถานที่: OpenStreetMap Nominatim
- ข้อมูลวัสดุรับเป็นระดับโครงการ ไม่ใช่การยืนยันรายถัง; ทุกจุดมีคำเตือนให้ตรวจจุดรับก่อนเดินทาง
- `./near-cycle.sh start` จะเพิ่มเฉพาะจุดใหม่ที่ยังไม่มีใน Database ไม่เปลี่ยนหรือลบจุดเดิม และยังไม่นำเข้าจุด WON #28
