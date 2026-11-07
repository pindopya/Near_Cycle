import 'leaflet/dist/leaflet.css';
import './globals.css';
import './ux-foundation.css';
import './navigation.css';
import './map-ux.css';
import './auth-form-ux.css';
import './detail-navigation-ux.css';
import './admin-ux.css';
import './motion.css';
import RouteProgress from '../components/common/RouteProgress';
import SiteHeader from '../components/common/SiteHeader';
import { AuthProvider } from '../lib/useAuth';

export const metadata = {
  title: 'OGTB Donation Map',
  description: 'Location-based donation map project',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#eef2f3',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <RouteProgress />
        <AuthProvider>
          <SiteHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
