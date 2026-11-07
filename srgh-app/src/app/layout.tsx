import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { UnsavedChangesProvider } from '@/components/ui/UnsavedChangesProvider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  weight: 'variable',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: 'variable',
})

const title = 'SGRH - Sistema de Gestión de Recursos Humanos'
const description =
  'Gestión de talento, asistencia y planillas de Celulares Alex en una sola plataforma.'
const socialImage = {
  url: '/brand/sgrh-social.png',
  width: 1200,
  height: 630,
  alt: 'Símbolo azul y cian de SGRH',
}

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://celulares-alex-frontend.vercel.app'
  ),
  title: { default: title, template: '%s | SGRH' },
  description,
  applicationName: 'SGRH',
  category: 'business',
  openGraph: {
    type: 'website',
    locale: 'es_CR',
    siteName: 'SGRH',
    title,
    description,
    images: [socialImage],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [socialImage],
  },
  icons: {
    icon: '/favicon.ico',
    apple: { url: '/brand/sgrh-apple-icon.png', sizes: '180x180', type: 'image/png' },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
