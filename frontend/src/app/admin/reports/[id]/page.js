'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminNav from '../../../../components/common/AdminNav';
import { api } from '../../../../lib/api';
import { formatBangkokDate } from '../../../../lib/date';

const REASON_LABELS = {
  ILLEGAL_ITEM: 'สิ่งของผิดกฎหมาย',
  DANGEROUS_ITEM: 'ของอันตราย',
  FRAUD: 'ข้อมูลหลอกลวง',
  INAPPROPRIATE_CONTENT: 'เนื้อหาไม่เหมาะสม',
  OTHER: 'เหตุผลอื่น',
};

export default function AdminReportDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let active = true;
    api(`/api/admin/reports/${id}`)
      .then((result) => { if (active) setReport(result); })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'โหลด Report ไม่สำเร็จ');
      });
    return () => { active = false; };
  }, [id]);

  async function resolveReport() {
    setBusy('report');
    setError('');
    try {
      setReport(await api(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      }));
    } catch (requestError) {
      setError(requestError.message || 'อัปเดต Report ไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function hideDonation() {
    if (!report?.donation) return;
    setBusy('donation');
    setError('');
    try {
      const updated = await api(`/api/admin/donations/${report.donation.id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ isHidden: true }),
      });
      setReport((current) => ({ ...current, donation: { ...current.donation, ...updated } }));
    } catch (requestError) {
      setError(requestError.message || 'ซ่อน Donation ไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function suspendOwner() {
    const owner = report?.donation?.owner;
    if (!owner) return;
    setBusy('owner');
    setError('');
    try {
      const updated = await api(`/api/admin/users/${owner.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      setReport((current) => ({
        ...current,
        donation: {
          ...current.donation,
          owner: { ...current.donation.owner, isActive: updated.isActive },
        },
      }));
    } catch (requestError) {
      setError(requestError.message || 'ระงับบัญชีไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function deleteDonation() {
    if (!report?.donation || !window.confirm('ลบ Donation นี้ออกจากระบบใช่หรือไม่')) return;
    setBusy('delete');
    setError('');
    try {
      await api(`/api/admin/donations/${report.donation.id}`, { method: 'DELETE' });
      router.replace('/admin/reports');
    } catch (requestError) {
      setError(requestError.message || 'ลบ Donation ไม่สำเร็จ');
      setBusy('');
    }
  }

  return (
    <div className="adminPortShell">
      <AdminNav />
      <main className="page adminPortPage">
        <header className="pageTitle">
          <div>
            <span className="eyebrow">ADMIN · REPORT</span>
            <h1>{report ? REASON_LABELS[report.reason] || report.reason : 'Report Detail'}</h1>
            {report && <p>รายงานเมื่อ {formatBangkokDate(report.createdAt)} · โดย {report.reporter?.name || '-'}</p>}
          </div>
          <Link href="/admin/reports" className="button">← กลับ Reports</Link>
        </header>

        {error && <div className="errorBox">{error}</div>}
        {!report && !error && <div className="centerState adminPortLoading">กำลังโหลด Report...</div>}

        {report && (
          <>
            <section className="card">
              <div className="pointSectionHeading">
                <div><span>ข้อมูล Report</span><h3>{REASON_LABELS[report.reason] || report.reason}</h3></div>
                <span className={`chip ${report.status === 'PENDING' ? 'adminChipWarning' : 'adminChipActive'}`}>{report.status}</span>
              </div>
              <div className="metaGrid adminPortMetaGrid">
                <div className="metaItem"><span>เหตุผล</span><strong>{report.reason}</strong></div>
                <div className="metaItem"><span>สถานะ</span><strong>{report.status}</strong></div>
                <div className="metaItem"><span>ผู้รายงาน</span><strong>{report.reporter?.name || '-'}</strong></div>
                <div className="metaItem"><span>Email</span><strong>{report.reporter?.email || '-'}</strong></div>
              </div>
              <p className="adminPortDescription">{report.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
            </section>

            <section className="card">
              <div className="pointSectionHeading"><div><span>โพสต์ที่เกี่ยวข้อง</span><h3>{report.donation?.title || 'Donation'}</h3></div></div>
              <div className="metaGrid adminPortMetaGrid">
                <div className="metaItem"><span>ประเภท</span><strong>{report.donation?.category || '-'}</strong></div>
                <div className="metaItem"><span>เจ้าของ</span><strong>{report.donation?.owner?.name || '-'}</strong></div>
                <div className="metaItem"><span>สถานะเจ้าของ</span><strong>{report.donation?.owner?.isActive ? 'ACTIVE' : 'SUSPENDED'}</strong></div>
                <div className="metaItem"><span>Visibility</span><strong>{report.donation?.isHidden ? 'HIDDEN' : 'VISIBLE'}</strong></div>
              </div>
              {report.donation && <div className="formActions formActionsStart"><Link href={`/admin/donations/${report.donation.id}`} className="button">เปิด Donation Detail →</Link></div>}
            </section>

            <section className="card adminPortActionCard">
              <div className="pointSectionHeading"><div><span>การจัดการ</span><h3>ดำเนินการกับ Report</h3></div></div>
              <div className="sectionActions">
                <button type="button" className="button" onClick={hideDonation} disabled={Boolean(busy) || report.donation?.isHidden}>
                  {busy === 'donation' ? 'กำลังซ่อน...' : report.donation?.isHidden ? 'ซ่อนอยู่แล้ว' : 'ซ่อน Donation'}
                </button>
                <button type="button" className="button danger" onClick={suspendOwner} disabled={Boolean(busy) || !report.donation?.owner?.isActive}>
                  {busy === 'owner' ? 'กำลังระงับ...' : report.donation?.owner?.isActive ? 'ระงับเจ้าของโพสต์' : 'เจ้าของถูกระงับแล้ว'}
                </button>
                <button type="button" className="button danger" onClick={deleteDonation} disabled={Boolean(busy)}>{busy === 'delete' ? 'กำลังลบ...' : 'ลบ Donation'}</button>
                <button type="button" className="button primary" onClick={resolveReport} disabled={Boolean(busy) || report.status === 'RESOLVED'}>
                  {busy === 'report' ? 'กำลังบันทึก...' : report.status === 'RESOLVED' ? 'ตรวจสอบแล้ว' : 'ปิด Report'}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
