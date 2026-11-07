'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminNav from '../../components/common/AdminNav';
import { api } from '../../lib/api';

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/admin/summary')
      .then(setSummary)
      .catch((requestError) => setError(requestError.message || 'โหลด Dashboard ไม่สำเร็จ'));
  }, []);

  return (
    <div className="adminPortShell">
      <AdminNav />
      <main className="page adminPortPage">
        <header className="pageTitle">
          <div>
            <span className="eyebrow">ADMIN</span>
            <h1>Dashboard</h1>
            <p>ภาพรวมสำหรับตรวจสอบผู้ใช้ ของบริจาค และรายงานที่ต้องจัดการ</p>
          </div>
        </header>

        {error && <div className="errorBox">{error}</div>}
        {!error && !summary && (
          <section className="card" role="status" aria-label="กำลังโหลดข้อมูล Dashboard">
            <div className="stats adminPortStats">
              {[0, 1, 2].map((key) => (
                <div key={key} className="stat adminPortStat isSkeleton" aria-hidden="true"><span /><strong /><small /></div>
              ))}
            </div>
          </section>
        )}

        {summary && (
          <section className="card">
            <div className="pointSectionHeading">
              <div><span>ภาพรวมระบบ</span><h3>ข้อมูลที่ต้องดูแล</h3></div>
            </div>
            <div className="stats adminPortStats">
              <Link href="/admin/users" className="stat adminPortStat"><span>ผู้ใช้ทั้งหมด</span><strong>{summary.users}</strong><small>จัดการบัญชี →</small></Link>
              <Link href="/admin/donations" className="stat adminPortStat"><span>ของบริจาค</span><strong>{summary.donations}</strong><small>ตรวจสอบโพสต์ →</small></Link>
              <Link href="/admin/reports" className="stat adminPortStat"><span>รายงาน</span><strong>{summary.reports}</strong><small>{summary.pendingReports} รายการรอตรวจสอบ →</small></Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
