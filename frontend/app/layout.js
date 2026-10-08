import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import ToasterWrapper from '@/components/ToasterWrapper';
import FaviconLoader from '@/components/FaviconLoader';

export const metadata = {
  title: 'WorkforceOS — HR & Attendance Portal',
  description: 'Smart Workforce & Attendance Management Portal',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <FaviconLoader />
          <ToasterWrapper />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
