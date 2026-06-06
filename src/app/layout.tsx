import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'
import './globals.css'
import { Shell } from '@/components/layout/Shell'
import { Toaster } from '@/components/ui/toaster'
import { TrackingBeacon } from '@/components/shared/TrackingBeacon'
import { CookieConsent } from '@/components/shared/CookieConsent'

// Self-hosted Plus Jakarta Sans (variable font: one file covers weights 200–800).
const jakarta = localFont({
  src: [
    {
      path: '../../public/fonts/Plus_Jakarta_Sans/PlusJakartaSans-VariableFont_wght.ttf',
      weight: '200 800',
      style: 'normal',
    },
    {
      path: '../../public/fonts/Plus_Jakarta_Sans/PlusJakartaSans-Italic-VariableFont_wght.ttf',
      weight: '200 800',
      style: 'italic',
    },
  ],
  variable: '--font-jakarta',
  display: 'swap',
})

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  title: {
    default: 'GameHub',
    template: '%s · GameHub',
  },
  description:
    'Browse, manage and download your personal game collection — Switch, 3DS, NDS, Wii, PSP, PS Vita and more, all in one place.',
  metadataBase: new URL(appUrl),
  openGraph: {
    type:        'website',
    url:         appUrl,
    siteName:    'GameHub',
    title:       'GameHub',
    description: 'Browse, manage and download your personal game collection — Switch, 3DS, NDS, Wii, PSP, PS Vita and more, all in one place.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'GameHub' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'GameHub',
    description: 'Browse, manage and download your personal game collection — Switch, 3DS, NDS, Wii, PSP, PS Vita and more, all in one place.',
    images:      ['/opengraph-image'],
  },
  icons: {
    icon:     '/favicon.png',
    shortcut: '/favicon.png',
    apple:    '/favicon.png',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  return (
    <html lang={locale} className="dark">
      <body className={`${jakarta.variable} font-sans antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Shell>{children}</Shell>
          <Toaster />
          <TrackingBeacon />
          <CookieConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
