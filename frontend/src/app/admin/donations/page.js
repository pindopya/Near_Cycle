'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminNav from '../../../components/common/AdminNav';
import { api } from '../../../lib/api';

export default function AdminDonationsPage() {
  const [donations, setDonations] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/api/admin/donations')
      .then(setDonations)
      .catch((requestError) => setError(requestError.message || 'โหลด Donations ไม่สำเร็จ'))
      .finally(() => setLoaded(true));
  }, []);

  async function toggleVisibility(donation) {
    setBusyId(donation.id);
    setError('');
    try {
      const updated = await api(`/api/admin/donations/${donation.id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ isHidden: !donation.isHidden }),
      });
      setDonations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (requestError) {
      setError(requestError.message || 'อัปเดตโพสต์ไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  async function removeDonation(donation) {
    if (!window.confirm(`ลบโพสต์ “${donation.title}” ใช่หรือไม่`)) return;
    setBusyId(donation.id);
    setError('');
    try {
      await api(`/api/admin/donations/${donation.id}`, { method: 'DELETE' });
      setDonations((current) => current.filter((item) => item.id !== donation.id));
    } catch (requestError) {
      setError(requestError.message || 'ลบโพสต์ไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="adminPortShell">
      <AdminNav />
      <main className="page adminPortPage">
        <header className="pageTitle">
          <div>
            <span className="eyebrow">ADMIN</span>
            <h1>ของบริจาค</h1>
            <p>ตรวจสอบโพสต์ทั้งหมด รวมถึงโพสต์ที่ถูกซ่อน และจัดการ Visibility เมื่อจำเป็น</p>
          </div>
          <span className="adminPortCount"><strong>{donations.length}</strong><small>โพสต์</small></span>
        </header>

        {error && <div className="errorBox">{error}</div>}
        {!loaded && !error && <div className="centerState adminPortLoading">กำลังโหลดโพสต์บริจาค...</div>}

        {loaded && !error && (
          <section className="card adminPortListCard">
            <div className="pointSectionHeading"><div><span>รายการทั้งหมด</span><h3>Donations</h3></div></div>
            <div className="adminPortList">
              {donations.map((donation) => (
                <article className="listRow adminPortListRow" key={donation.id}>
                  <div className="listIcon adminPortDonationIcon" aria-hidden="true">🎁</div>
                  <div className="adminPortListCopy">
                    <Link href={`/admin/donations/${donation.id}`} className="adminPortTitleLink">{donation.title}</Link>
                    <small className="muted">{donation.category} · {donation.owner?.name || '-'}</small>
                    <div className="adminPortChips">
                      <span className="chip">{donation.status}</span>
                      <span className={`chip ${donation.isHidden ? 'adminChipDanger' : 'adminChipActive'}`}>{donation.isHidden ? 'HIDDEN' : 'VISIBLE'}</span>
                    </div>
                    <small className="muted">Reports {donation._count?.reports ?? 0}</small>
                  </div>
                  <div className="sectionActions adminPortRowActions">
                    <button type="button" className="button" onClick={() => toggleVisibility(donation)} disabled={busyId === donation.id}>
                      {busyId === donation.id ? '...' : donation.isHidden ? 'แสดง' : 'ซ่อน'}
                    </button>
                    <button type="button" className="button danger" onClick={() => removeDonation(donation)} disabled={busyId === donation.id}>ลบ</button>
                  </div>
                </article>
              ))}
              {donations.length === 0 && <div className="empty">ไม่พบโพสต์บริจาค</div>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
