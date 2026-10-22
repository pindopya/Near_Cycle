'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AdminNav from '../../../components/common/AdminNav';
import { api } from '../../../lib/api';
import { formatBangkokDate } from '../../../lib/date';

const REASON_LABELS = {
  ILLEGAL_ITEM: 'สิ่งของผิดกฎหมาย',
  DANGEROUS_ITEM: 'ของอันตราย',
  FRAUD: 'ข้อมูลหลอกลวง',
  INAPPROPRIATE_CONTENT: 'เนื้อหาไม่เหมาะสม',
  OTHER: 'เหตุผลอื่น',
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/api/admin/reports')
      .then(setReports)
      .catch((requestError) => setError(requestError.message || 'โหลด Reports ไม่สำเร็จ'))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="adminPortShell">
      <AdminNav />
      <main className="page adminPortPage">
        <header className="pageTitle">
          <div>
            <span className="eyebrow">ADMIN</span>
            <h1>รายงาน</h1>
            <p>ตรวจสอบ Report จากผู้ใช้ โดยดู Donation และผู้เกี่ยวข้องก่อนเลือกดำเนินการ</p>
          </div>
          <span className="adminPortCount"><strong>{reports.length}</strong><small>รายการ</small></span>
        </header>

        {error && <div className="errorBox">{error}</div>}
        {!loaded && !error && <div className="centerState adminPortLoading">กำลังโหลด Reports...</div>}

        {loaded && !error && (
          <section className="card adminPortListCard">
            <div className="pointSectionHeading"><div><span>รายการตรวจสอบ</span><h3>Reports</h3></div></div>
            <div className="adminPortList">
              {reports.map((report) => (
                <article className="listRow adminPortListRow" key={report.id}>
                  <div className="listIcon adminPortReportIcon" aria-hidden="true">!</div>
                  <div className="adminPortListCopy">
                    <Link className="adminPortTitleLink" href={`/admin/reports/${report.id}`}>{REASON_LABELS[report.reason] || report.reason}</Link>
                    <small className="muted">{report.donation?.title || '-'} · Reporter {report.reporter?.name || '-'}</small>
                    <div className="adminPortChips">
                      <span className={`chip ${report.status === 'PENDING' ? 'adminChipWarning' : 'adminChipActive'}`}>{report.status}</span>
                      <span className="chip">{formatBangkokDate(report.createdAt)}</span>
                    </div>
                  </div>
                  <Link className="button" href={`/admin/reports/${report.id}`}>ดูรายละเอียด</Link>
                </article>
              ))}
              {reports.length === 0 && <div className="empty">ไม่พบ Report</div>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
