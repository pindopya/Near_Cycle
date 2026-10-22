'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../../lib/useAuth';

export default function SiteHeader() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [menuPath, setMenuPath] = useState(null);
  const menuOpen = menuPath === pathname;

  const mapHome = pathname === '/';
  const isAdminPage = pathname.startsWith('/admin');
  const isNavigationPage = /^\/donations\/[^/]+\/navigate$/.test(pathname);

  if (isAdminPage || isNavigationPage) return null;

  const closeMenu = () => setMenuPath(null);

  async function handleLogout() {
    closeMenu();
    await logout();
    window.location.replace('/');
  }

  return (
    <header className={`topbar${mapHome ? ' mapTopbar' : ''}`}>
      <Link className="brand" href="/" onClick={closeMenu} aria-label="OGTB Donation Map">
        <span className="brandMark" aria-hidden="true"><span className="brandGlyph" /></span>
        <span>Donation Map<small>OGTB COMMUNITY</small></span>
      </Link>

      <nav className="navActions navDesktopActions" aria-label="เมนูหลัก">
        <Link href="/" className="navLink">แผนที่</Link>
        {!loading && user?.role === 'ADMIN' && <Link href="/admin" className="navLink">Dashboard</Link>}
        {!loading && user && <Link href="/donations/new" className="button soft">+ เพิ่มของบริจาค</Link>}
        {!loading && !user && <Link href="/login" className="button primary">เข้าสู่ระบบ</Link>}
        {!loading && user && <button type="button" className="button ghost" onClick={handleLogout}>ออกจากระบบ</button>}
      </nav>

      <div className="navMobileWrap">
        <button
          type="button"
          className={`navMenuButton${menuOpen ? ' isOpen' : ''}`}
          aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={menuOpen}
          aria-controls="ogtb-mobile-menu"
          onClick={() => setMenuPath(menuOpen ? null : pathname)}
        >
          <span />
          <span />
          <span />
        </button>

        {menuOpen && (
          <nav id="ogtb-mobile-menu" className="navMobileMenu" aria-label="เมนูมือถือ">
            <Link href="/" className="navMobileItem" onClick={closeMenu}>แผนที่</Link>
            {!loading && user?.role === 'ADMIN' && <Link href="/admin" className="navMobileItem" onClick={closeMenu}>Dashboard</Link>}
            {!loading && user && <Link href="/donations/new" className="navMobileItem navMobilePrimary" onClick={closeMenu}>+ เพิ่มของบริจาค</Link>}
            {!loading && !user && <Link href="/login" className="navMobileItem navMobilePrimary" onClick={closeMenu}>เข้าสู่ระบบ</Link>}
            {!loading && user && <button type="button" className="navMobileItem navMobileLogout" onClick={handleLogout}>ออกจากระบบ</button>}
          </nav>
        )}
      </div>
    </header>
  );
}
