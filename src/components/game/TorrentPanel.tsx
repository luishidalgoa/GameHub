import { Magnet } from 'lucide-react'
import { useTranslations } from 'next-intl'

/** Botón verde que abre el magnet en el cliente de torrents del usuario. */
export function TorrentPanel({ magnet }: { magnet: string }) {
  const t = useTranslations('GameGrid')
  return (
    <a
      href={magnet}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
    >
      <Magnet className="w-4 h-4" />
      {t('downloadTorrent')}
    </a>
  )
}
