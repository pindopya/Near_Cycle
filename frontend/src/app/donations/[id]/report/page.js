'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/useAuth';

const REASONS = [
  ['ILLEGAL_ITEM', 'สิ่งของผิดกฎหมาย'],
  ['DANGEROUS_ITEM', 'ของอันตราย'],
  ['FRAUD', 'ข้อมูลหลอกลวง'],
  ['INAPPROPRIATE_CONTENT', 'รูปหรือเนื้อหาไม่เหมาะสม'],
  ['OTHER', 'เหตุผลอื่น ๆ'],
];

export default function ReportDonationPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=/donations/${id}/report`);
  }, [loading, user, router, id]);

  async function submit(event) {
    event.preventDefault();
    if (!reason) {
      setError('กรุณาเลือกเหตุผลที่ต้องการรายงาน');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api(`/api/donations/${id}/reports`, {
        method: 'POST',
        body: JSON.stringify({ reason, description }),
      });
      router.replace(`/donations/${id}?reported=1`);
    } catch (requestError) {
      if (requestError.status === 401) {
        router.replace(`/login?next=/donations/${id}/report`);
        return;
      }
      setError(requestError.message || 'ส่งรายงานไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) return <main className="centerState">กำลังตรวจสอบบัญชี...</main>;

  return (
    <main className="page reportPortPage">
      <header className="reportPortHeader">
        <div>
          <span className="eyebrow">ความปลอดภัยของชุมชน</span>
          <h1>รายงานโพสต์</h1>
          <p>เลือกเหตุผลที่ตรงกับปัญหา ข้อมูลจะถูกส่งให้ Admin ตรวจสอบ</p>
        </div>
        <Link href={`/donations/${id}`} className="button">← กลับรายละเอียด</Link>
      </header>

      <form className="card reportPortCard" onSubmit={submit}>
        <div className="pointSectionHeading">
          <div><span>เหตุผล</span><h3>เลือกเหตุผลที่ต้องการรายงาน</h3></div>
        </div>

        <div className="reportReasonList">
          {REASONS.map(([value, label]) => (
            <label key={value} className={reason === value ? 'isSelected' : ''}>
              <input type="radio" name="reason" value={value} checked={reason === value} onChange={(event) => setReason(event.target.value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="field">
          <label htmlFor="report-description">รายละเอียดเพิ่มเติม</label>
          <textarea
            id="report-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="อธิบายเพิ่มเติมได้ หากมีข้อมูลที่ช่วยให้ Admin ตรวจสอบง่ายขึ้น"
          />
          <small className="reportDescriptionCounter">{description.length}/1000</small>
        </div>

        {error && <div className="errorBox" role="alert">{error}</div>}

        <div className="reportPortActions">
          <Link href={`/donations/${id}`} className="button">ยกเลิก</Link>
          <button className="button primary" type="submit" disabled={submitting}>{submitting ? 'กำลังส่ง...' : 'ส่งรายงาน'}</button>
        </div>
      </form>
    </main>
  );
}
