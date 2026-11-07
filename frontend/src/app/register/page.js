'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, setSessionUser } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submittedHere = useRef(false);

  useEffect(() => {
    if (!authLoading && user && !submittedHere.current) router.replace('/');
  }, [authLoading, user, router]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('รหัสผ่านยืนยันไม่ตรงกัน');
      return;
    }
    submittedHere.current = true;
    setLoading(true);
    try {
      const result = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      setSessionUser(result.user);
      router.replace('/');
      router.refresh();
    } catch (requestError) {
      submittedHere.current = false;
      setError(requestError.message || 'สมัครสมาชิกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authShell">
      <section className="authVisual">
        <div className="authBrandMark" aria-hidden="true"><span className="brandGlyph" /></div>
        <div>
          <h1>เริ่มแบ่งปันของที่ยังมีคุณค่าจากจุดเล็ก ๆ ใกล้ตัว</h1>
          <p>สร้างบัญชีเพื่อเพิ่มจุดบริจาค ค้นหาของใกล้ตัว และช่วยให้ข้อมูลบนแผนที่เป็นประโยชน์กับทุกคน</p>
        </div>
      </section>

      <section className="authPanel">
        <form className="authCard" onSubmit={submit}>
          <span className="eyebrow">เข้าร่วม OGTB</span>
          <h1>สร้างบัญชี OGTB</h1>
          <p>ใช้ชื่อ อีเมล และรหัสผ่านความยาว 8-72 ตัวอักษร</p>
          {error && <div className="errorBox" role="alert">{error}</div>}

          <div className="field">
            <label htmlFor="register-name">ชื่อที่แสดง</label>
            <input
              id="register-name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>

          <div className="field authFieldGap">
            <label htmlFor="register-email">อีเมล</label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>

          <div className="field authFieldGap">
            <label htmlFor="register-password">รหัสผ่าน</label>
            <input
              id="register-password"
              type="password"
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </div>

          <div className="field authFieldGap">
            <label htmlFor="register-confirm">ยืนยันรหัสผ่าน</label>
            <input
              id="register-confirm"
              type="password"
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
              value={form.confirm}
              onChange={(event) => setForm({ ...form, confirm: event.target.value })}
            />
          </div>

          <button className="button primary block authSubmit" disabled={loading} aria-busy={loading}>
            {loading ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชี'}
          </button>
          <p className="authSwitch">มีบัญชีแล้ว? <Link href="/login" className="authSwitchLink">เข้าสู่ระบบ</Link></p>
        </form>
      </section>
    </main>
  );
}
