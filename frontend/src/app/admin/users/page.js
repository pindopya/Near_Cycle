'use client';

import { useEffect, useState } from 'react';
import AdminNav from '../../../components/common/AdminNav';
import { api } from '../../../lib/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/api/admin/users')
      .then(setUsers)
      .catch((requestError) => setError(requestError.message || 'โหลด Users ไม่สำเร็จ'))
      .finally(() => setLoaded(true));
  }, []);

  async function toggleUser(user) {
    setBusyId(user.id);
    setError('');
    try {
      const updated = await api(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (requestError) {
      setError(requestError.message || 'อัปเดตผู้ใช้ไม่สำเร็จ');
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
            <h1>ผู้ใช้</h1>
            <p>ตรวจสอบ Role กิจกรรมในระบบ และระงับหรือเปิดใช้งานบัญชีที่มีปัญหา</p>
          </div>
          <span className="adminPortCount"><strong>{users.length}</strong><small>บัญชี</small></span>
        </header>

        {error && <div className="errorBox">{error}</div>}
        {!loaded && !error && <div className="centerState adminPortLoading">กำลังโหลดข้อมูลผู้ใช้...</div>}

        {loaded && !error && (
          <section className="card adminPortListCard">
            <div className="pointSectionHeading"><div><span>บัญชีในระบบ</span><h3>Users</h3></div></div>
            <div className="adminPortList">
              {users.map((user) => (
                <article className="listRow adminPortListRow" key={user.id}>
                  <div className="listIcon adminPortAvatar" aria-hidden="true">{user.name?.trim()?.[0]?.toUpperCase() || 'U'}</div>
                  <div className="adminPortListCopy">
                    <strong>{user.name}</strong>
                    <small className="muted">{user.email}</small>
                    <div className="adminPortChips">
                      <span className="chip">{user.role}</span>
                      <span className={`chip ${user.isActive ? 'adminChipActive' : 'adminChipDanger'}`}>{user.isActive ? 'ACTIVE' : 'SUSPENDED'}</span>
                    </div>
                    <small className="muted">Donation {user._count?.donations ?? 0} · Report {user._count?.reports ?? 0}</small>
                  </div>
                  <button type="button" className={`button ${user.isActive ? 'danger' : 'soft'}`} onClick={() => toggleUser(user)} disabled={busyId === user.id}>
                    {busyId === user.id ? 'กำลังบันทึก...' : user.isActive ? 'ระงับบัญชี' : 'เปิดใช้งาน'}
                  </button>
                </article>
              ))}
              {users.length === 0 && <div className="empty">ไม่พบข้อมูลผู้ใช้</div>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
