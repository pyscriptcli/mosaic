import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Project Atlas - WebGIS Platform',
  description: 'Enterprise GIS mapping and spatial analysis platform built with Next.js, MapLibre GL, and FastAPI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased overflow-hidden w-screen h-screen">
        {children}
      </body>
    </html>
  );
}
