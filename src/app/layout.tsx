import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'
import './globals.css'
import { Shell } from '@/components/layout/Shell'
import { Toaster } from '@/components/ui/toaster'
import { TrackingBeacon } from '@/components/shared/TrackingBeacon'
import { CookieConsent } from '@/components/shared/CookieConsent'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'GameHub',
  description: 'Your personal ROM library',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  return (
    <html lang={locale} className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
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
