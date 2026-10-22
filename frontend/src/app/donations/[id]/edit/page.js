'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import DonationForm from '../../../../components/donation/DonationForm';
import { api } from '../../../../lib/api';
import { updateDonationWithImages, uploadDonationImages } from '../../../../lib/donationActions';
import { useAuth } from '../../../../lib/useAuth';

export default function EditDonationPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [donation, setDonation] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [partialUpload, setPartialUpload] = useState(null);

  async function loadDonation() {
    try {
      const result = await api(`/api/donations/${id}`);
      setDonation(result);
      return result;
    } catch (requestError) {
      setError(requestError.message || 'โหลดข้อมูลไม่สำเร็จ');
      return null;
    }
  }

  useEffect(() => {
    let active = true;
    api(`/api/donations/${id}`)
      .then((result) => { if (active) setDonation(result); })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'โหลดข้อมูลไม่สำเร็จ');
      });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?next=/donations/${id}/edit`);
  }, [authLoading, user, router, id]);

  async function submit({ data, files }) {
    setSubmitting(true);
    setError('');
    try {
      const result = await updateDonationWithImages(id, data, files);
      if (result.imageUploadError) {
        await loadDonation();
        setPartialUpload({
          files,
          message: result.imageUploadError.message || 'อัปโหลดรูปไม่สำเร็จ',
        });
        return;
      }
      router.replace(`/donations/${id}`);
    } catch (requestError) {
      setError(requestError.message || 'แก้ไขโพสต์ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function retryImages() {
    if (!partialUpload?.files?.length) return;
    setSubmitting(true);
    setError('');
    try {
      await uploadDonationImages(id, partialUpload.files);
      router.replace(`/donations/${id}`);
    } catch (requestError) {
      setError(requestError.message || 'อัปโหลดรูปยังไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteImage(imageId) {
    if (!window.confirm('ลบรูปนี้หรือไม่?')) return;
    try {
      await api(`/api/donations/${id}/images/${imageId}`, { method: 'DELETE' });
      setDonation((current) => ({ ...current, images: current.images.filter((image) => image.id !== imageId) }));
    } catch (requestError) {
      setError(requestError.message || 'ลบรูปไม่สำเร็จ');
    }
  }

  if (authLoading || !donation) {
    return <main className="page createPointPage"><div className="centerState">{error || 'กำลังโหลด...'}</div></main>;
  }
  if (!user) return null;
  if (donation.ownerId !== user.id) {
    return (
      <main className="page narrow">
        <section className="card">
          <div className="errorBox">คุณไม่มีสิทธิ์แก้ไขโพสต์นี้</div>
          <Link href={`/donations/${id}`} className="button">กลับไปหน้ารายละเอียด</Link>
        </section>
      </main>
    );
  }

  if (partialUpload) {
    return (
      <main className="page narrow">
        <div className="pageTitle">
          <div>
            <span className="eyebrow">บันทึกข้อมูลแล้ว</span>
            <h1>อัปโหลดรูปใหม่ยังไม่สำเร็จ</h1>
            <p>ข้อมูล Donation ถูกแก้ไขแล้ว การลองใหม่จะอัปโหลดเฉพาะรูปและไม่บันทึกข้อมูลซ้ำ</p>
          </div>
        </div>
        <section className="card partialSaveCard">
          <div className="warningBox">รูปภาพ: {partialUpload.message}</div>
          {error && <div className="errorBox">{error}</div>}
          <div className="sectionActions partialSaveActions">
            <button type="button" className="button primary" onClick={retryImages} disabled={submitting}>
              {submitting ? 'กำลังอัปโหลด...' : 'ลองอัปโหลดรูปอีกครั้ง'}
            </button>
            <Link href={`/donations/${id}`} className="button">ดูข้อมูลที่บันทึกแล้ว</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page createPointPage">
      <div className="pageTitle">
        <div>
          <span className="eyebrow">แก้ไขจุดบริจาค</span>
          <h1>แก้ไขของบริจาค</h1>
          <p>ปรับตำแหน่ง รูปภาพ รายละเอียด และช่วงเวลาของโพสต์นี้</p>
        </div>
      </div>

      {error && <div className="errorBox">{error}</div>}
      <DonationForm
        donation={donation}
        onSubmit={submit}
        submitting={submitting}
        submitLabel="บันทึกการแก้ไข"
        cancelHref={`/donations/${id}`}
        onDeleteExistingImage={deleteImage}
      />
    </main>
  );
}
