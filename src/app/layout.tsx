import './globals.css';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Sitio Personal | Leo Sanxyz',
  description: 'Portafolio de escritura, arte y software de Leo Sanxyz',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <header className="border-b bg-white shadow-sm">
          <nav className="container mx-auto flex items-center justify-between py-4 px-4">
            <span className="font-bold text-xl">Leo Sanxyz</span>
            <ul className="flex gap-6">
              <li><Link href="/escritura" className="hover:underline">Escritura</Link></li>
              <li><Link href="/arte" className="hover:underline">Arte</Link></li>
              <li><Link href="/software" className="hover:underline">Software</Link></li>
            </ul>
          </nav>
        </header>
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
} 