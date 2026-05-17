import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

const SUPPORTED = ['en', 'es'] as const
type Locale = (typeof SUPPORTED)[number]

function resolveLocale(): Locale {
  const cookie = cookies().get('NEXT_LOCALE')?.value
  if (cookie && SUPPORTED.includes(cookie as Locale)) return cookie as Locale

  const acceptLang = headers().get('Accept-Language') ?? ''
  const lang = acceptLang.split(',')[0].split('-')[0].trim().toLowerCase()
  if (SUPPORTED.includes(lang as Locale)) return lang as Locale

  return 'en'
}

export default getRequestConfig(async () => {
  const locale = resolveLocale()
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
