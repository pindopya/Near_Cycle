'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/useAuth';

const ITEMS = [
  { href: '/admin', label: 'ภาพรวม', exact: true },
  { href: '/admin/users', label: 'ผู้ใช้' },
  { href: '/admin/donations', label: 'ของบริจาค' },
  { href: '/admin/reports', label: 'รายงาน' },
];

function activeFor(pathname, item) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'ADMIN')) router.replace('/');
  }, [loading, user, router]);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    window.location.replace('/');
  }

  return (
    <>
      <header className="topbar adminPortTopbar">
        <Link href="/admin" className="brand" onClick={() => setMenuOpen(false)} aria-label="OGTB Admin">
          <span className="brandMark" aria-hidden="true"><span className="brandGlyph" /></span>
          <span>Donation Map<small>ADMIN</small></span>
        </Link>

        <nav className="navActions navDesktopActions" aria-label="เมนู Admin">
          <Link href="/" className="navLink">แผนที่</Link>
          {!loading && user?.role === 'ADMIN' && <button type="button" className="button" onClick={handleLogout}>ออกจากระบบ</button>}
        </nav>

        <div className="navMobileWrap">
          <button
            type="button"
            className={`navMenuButton${menuOpen ? ' isOpen' : ''}`}
            aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-actions"
            onClick={() => setMenuOpen((value) => !value)}
          ><span /><span /><span /></button>
          {menuOpen && (
            <nav id="admin-mobile-actions" className="navMobileMenu" aria-label="เมนู Admin บนมือถือ">
              <Link href="/" className="navMobileItem" onClick={() => setMenuOpen(false)}>แผนที่</Link>
              {!loading && user?.role === 'ADMIN' && <button type="button" className="navMobileItem navMobileLogout" onClick={handleLogout}>ออกจากระบบ</button>}
            </nav>
          )}
        </div>
      </header>

      <div className="adminMiniNavWrap">
        <nav className="profileMiniNav adminMiniNav" aria-label="ส่วนจัดการระบบ">
          {ITEMS.map((item) => {
            const active = activeFor(pathname, item);
            return (
              <Link key={item.href} href={item.href} className={`profileMiniNavItem${active ? ' isActive' : ''}`} aria-current={active ? 'page' : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
