'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, assetUrl } from '../../../lib/api';
import { canNavigateToDonation } from '../../../lib/donationAvailability';
import { formatBangkokDate } from '../../../lib/date';
import { useAuth } from '../../../lib/useAuth';

const STATUS_LABELS = {
  AVAILABLE: 'พร้อมรับ',
  OUT_OF_STOCK: 'ของหมดแล้ว',
  EXPIRED: 'หมดช่วงบริจาค',
};

export default function DonationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedReturnTo = searchParams.get('returnTo');
  const mapBackHref = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/';
  const { user } = useAuth();
  const [donation, setDonation] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reported = searchParams.get('reported') === '1';
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api(`/api/donations/${id}`)
      .then((result) => {
        if (!active) return;
        setDonation(result);
        setSelectedImageId(result.images?.[0]?.id ?? null);
        setError('');
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'โหลดข้อมูลไม่สำเร็จ');
      });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    if (!reported) return;

    const cleaned = new URLSearchParams(searchParams.toString());
    cleaned.delete('reported');
    const query = cleaned.toString();
    window.history.replaceState(
      window.history.state,
      '',
      query ? `/donations/${id}?${query}` : `/donations/${id}`,
    );
  }, [id, reported, searchParams]);

  useEffect(() => {
    if (!photoOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setPhotoOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [photoOpen]);

  const selectedImage = donation?.images?.length
    ? donation.images.find((image) => image.id === selectedImageId) || donation.images[0]
    : null;

  async function markOutOfStock() {
    if (!window.confirm('ยืนยันว่าของหมดแล้ว? จุดนี้จะไม่แสดงบน Map')) return;
    setBusy(true);
    try {
      setDonation(await api(`/api/donations/${id}/out-of-stock`, { method: 'PATCH' }));
    } catch (requestError) {
      setError(requestError.message || 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function removeDonation() {
    if (!window.confirm('ลบโพสต์บริจาคนี้ถาวรหรือไม่?')) return;
    setBusy(true);
    try {
      await api(`/api/donations/${id}`, { method: 'DELETE' });
      router.replace('/');
    } catch (requestError) {
      setError(requestError.message || 'ลบโพสต์ไม่สำเร็จ');
      setBusy(false);
    }
  }

  if (error && !donation) {
    return <main className="page narrow"><div className="errorBox">{error}</div><Link href={mapBackHref} className="button">← กลับแผนที่</Link></main>;
  }

  if (!donation) return <main className="centerState">กำลังโหลดรายละเอียด...</main>;

  const canNavigate = canNavigateToDonation(donation);
  const isOwner = user?.id === donation.ownerId;
  const reportHref = user ? `/donations/${id}/report` : `/login?next=/donations/${id}/report`;
  const selectedImageUrl = selectedImage ? assetUrl(selectedImage.imageUrl) : '';
  const statusLabel = STATUS_LABELS[donation.status] || donation.status;

  return (
    <main className="page pointDetailPage">
      <header className="pointDetailHeader">
        <div>
          <span className="eyebrow">รายละเอียดของบริจาค</span>
          <h1>{donation.title}</h1>
          <p>บริจาคโดย {donation.owner?.name || 'ผู้ใช้ OGTB'} · เปิดถึง {formatBangkokDate(donation.endDate)}</p>
        </div>
        <Link href={mapBackHref} className="button pointBackButton">← กลับแผนที่</Link>
      </header>

      {error && <div className="errorBox">{error}</div>}
      {reported && <div className="successBox">ส่งรายงานให้ Admin ตรวจสอบแล้ว</div>}

      <section className="card pointHeroCard">
        <div className="pointPhotoPanel">
          {selectedImageUrl ? (
            <>
              <button type="button" className="pointPhotoButton" onClick={() => setPhotoOpen(true)} aria-label="เปิดรูปของบริจาคแบบเต็มจอ">
                <img className="pointHeroImage" src={selectedImageUrl} alt={donation.title} />
                <span className="pointPhotoHint">ดูรูปเต็ม</span>
              </button>
              {donation.images.length > 1 && (
                <div className="pointThumbRow" aria-label="เลือกรูปของบริจาค">
                  {donation.images.map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      className={`pointThumbButton${image.id === selectedImage?.id ? ' isActive' : ''}`}
                      onClick={() => setSelectedImageId(image.id)}
                      aria-label="เลือกรูปนี้"
                    >
                      <img src={assetUrl(image.imageUrl)} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="pointHeroFallback"><span>ไม่มีรูปภาพ</span></div>
          )}
        </div>

        <div className="pointHeroContent">
          <div className="pointHeroTopline">
            <span className="pointSeenBadge">{donation.category}</span>
            <span className="pointStatusBadge">{statusLabel}</span>
          </div>
          <h2>จำนวน {donation.quantity}</h2>
          <p className="pointDescription">{donation.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>

          <div className="pointMetaGrid">
            <div className="pointMetaItem"><span>เริ่มบริจาค</span><strong>{formatBangkokDate(donation.startDate)}</strong></div>
            <div className="pointMetaItem"><span>สิ้นสุด</span><strong>{formatBangkokDate(donation.endDate)}</strong></div>
            <div className="pointMetaItem"><span>จุดรับของ</span><strong>{donation.address || 'ตำแหน่งบนแผนที่'}</strong></div>
          </div>

          {canNavigate && <Link href={`/donations/${id}/navigate`} className="button primary block pointNavigateButton">นำทางไปจุดนี้</Link>}
        </div>
      </section>

      <div className="pointActionGrid">
        <section className="card pointInfoCard">
          <div className="pointSectionHeading">
            <div><span>ข้อมูลโพสต์</span><h3>รายละเอียดการรับของ</h3></div>
          </div>
          <div className="pointDetailList">
            <div><span>ผู้บริจาค</span><strong>{donation.owner?.name || '-'}</strong></div>
            <div><span>ประเภท</span><strong>{donation.category}</strong></div>
            <div><span>สถานะ</span><strong>{statusLabel}</strong></div>
          </div>
        </section>

        <section className="card pointManageCard">
          <div className="pointSectionHeading">
            <div><span>{isOwner ? 'จัดการโพสต์' : 'ความปลอดภัย'}</span><h3>{isOwner ? 'การจัดการของบริจาค' : 'พบข้อมูลมีปัญหา?'}</h3></div>
          </div>
          {isOwner ? (
            <div className="pointManageActions">
              <Link href={`/donations/${id}/edit`} className="button soft">แก้ไขโพสต์</Link>
              {donation.status === 'AVAILABLE' && <button type="button" className="button soft" disabled={busy} onClick={markOutOfStock}>ของหมดแล้ว</button>}
              <button type="button" className="button danger" disabled={busy} onClick={removeDonation}>ลบโพสต์</button>
            </div>
          ) : (
            <>
              <p className="pointManageCopy">หากโพสต์มีข้อมูลหลอกลวง สิ่งของอันตราย หรือเนื้อหาไม่เหมาะสม สามารถส่งให้ Admin ตรวจสอบได้</p>
              <Link href={reportHref} className="button pointReportButton">รายงานโพสต์</Link>
            </>
          )}
        </section>
      </div>

      {photoOpen && selectedImageUrl && (
        <div className="pointLightbox" role="dialog" aria-modal="true" aria-label="รูปของบริจาคแบบเต็มจอ" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhotoOpen(false); }}>
          <button type="button" className="pointLightboxClose" onClick={() => setPhotoOpen(false)} aria-label="ปิดรูป">
            <span className="pointLightboxCloseIcon" aria-hidden="true" />
            <span>ปิด</span>
          </button>
          <img src={selectedImageUrl} alt={`${donation.title} แบบเต็มจอ`} />
        </div>
      )}
    </main>
  );
}
