import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Sitio Personal | Leo Sanxyz',
  description: 'Portafolio de escritura, arte y software de Leo Sanxyz',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
} 