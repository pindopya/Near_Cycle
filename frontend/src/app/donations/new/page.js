'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import DonationForm from '../../../components/donation/DonationForm';
import { createDonationWithImages, uploadDonationImages } from '../../../lib/donationActions';
import { useAuth } from '../../../lib/useAuth';

export default function NewDonationPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [partialUpload, setPartialUpload] = useState(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login?next=/donations/new');
  }, [loading, user, router]);

  async function submit({ data, files }) {
    setSubmitting(true);
    setError('');
    try {
      const result = await createDonationWithImages(data, files);
      if (result.imageUploadError) {
        setPartialUpload({
          donation: result.donation,
          files,
          message: result.imageUploadError.message || 'อัปโหลดรูปไม่สำเร็จ',
        });
        return;
      }
      router.replace(`/donations/${result.donation.id}`);
    } catch (requestError) {
      setError(requestError.message || 'สร้างโพสต์บริจาคไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function retryImages() {
    if (!partialUpload?.files?.length) return;
    setSubmitting(true);
    setError('');
    try {
      await uploadDonationImages(partialUpload.donation.id, partialUpload.files);
      router.replace(`/donations/${partialUpload.donation.id}`);
    } catch (requestError) {
      setError(requestError.message || 'อัปโหลดรูปยังไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return <main className="page createPointPage"><div className="centerState">กำลังตรวจสอบบัญชี...</div></main>;
  }

  if (partialUpload) {
    return (
      <main className="page narrow">
        <div className="pageTitle">
          <div>
            <span className="eyebrow">บันทึกโพสต์แล้ว</span>
            <h1>อัปโหลดรูปยังไม่สำเร็จ</h1>
            <p>ข้อมูลของบริจาคถูกสร้างแล้ว การลองใหม่จะไม่สร้างโพสต์ซ้ำ</p>
          </div>
        </div>
        <section className="card partialSaveCard">
          <div className="warningBox">รูปภาพ: {partialUpload.message}</div>
          {error && <div className="errorBox">{error}</div>}
          <div className="sectionActions partialSaveActions">
            <button type="button" className="button primary" onClick={retryImages} disabled={submitting}>
              {submitting ? 'กำลังอัปโหลด...' : 'ลองอัปโหลดรูปอีกครั้ง'}
            </button>
            <Link href={`/donations/${partialUpload.donation.id}/edit`} className="button soft">ไปหน้าแก้ไข</Link>
            <Link href={`/donations/${partialUpload.donation.id}`} className="button">ดูโพสต์ที่สร้างแล้ว</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page createPointPage">
      <div className="pageTitle">
        <div>
          <span className="eyebrow">สร้างจุดใหม่</span>
          <h1>เพิ่มของบริจาค</h1>
          <p>เลือกตำแหน่ง เพิ่มรูป และรายละเอียดที่จำเป็นก่อนแสดงบนแผนที่</p>
        </div>
      </div>

      {error && <div className="errorBox">{error}</div>}
      <DonationForm onSubmit={submit} submitting={submitting} submitLabel="สร้างจุดบริจาค" cancelHref="/" />
    </main>
  );
}
