'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Save, Loader2, Heart, Coffee, Bitcoin, Target } from 'lucide-react'

interface Props {
  initial: {
    donate_kofi: string
    donate_bmac: string
    donate_crypto: string
    donate_message: string
    donate_quarter_goal_eur: string
  }
}

export function DonationSettingsForm({ initial }: Props) {
  const t = useTranslations('DonationSettings')
  const [kofi,    setKofi]    = useState(initial.donate_kofi)
  const [bmac,    setBmac]    = useState(initial.donate_bmac)
  const [crypto,  setCrypto]  = useState(initial.donate_crypto)
  const [message, setMessage] = useState(initial.donate_message)
  const [goal,    setGoal]    = useState(initial.donate_quarter_goal_eur)
  const [saving, setSaving]   = useState(false)
  const [saved,  setSaved]    = useState(false)

  const save = async () => {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donate_kofi:            kofi,
        donate_bmac:            bmac,
        donate_crypto:          crypto,
        donate_message:         message,
        donate_quarter_goal_eur: goal.trim(),
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const anyConfigured = kofi || bmac || crypto

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-red-400" />
          <h3 className="font-semibold">{t('title')}</h3>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? t('saved') : saving ? t('saving') : t('save')}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{t('description')}</p>

      <div className="space-y-4">
        {/* Custom message */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            {t('personalMessage')}
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('messagePlaceholder')}
            className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Quarterly goal */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-400" /> Objetivo trimestral (€)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Vacío = sin objetivo"
            className="w-full sm:w-56 bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Se muestra en la página de donaciones. Suma las donaciones en euros del trimestre en curso.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Ko-fi */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              <Coffee className="w-3.5 h-3.5" /> {t('kofiLabel')}
            </label>
            <input
              type="url"
              value={kofi}
              onChange={(e) => setKofi(e.target.value)}
              placeholder="https://ko-fi.com/yourusername"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Buy Me a Coffee */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              <Coffee className="w-3.5 h-3.5 text-yellow-400" /> {t('bmacLabel')}
            </label>
            <input
              type="url"
              value={bmac}
              onChange={(e) => setBmac(e.target.value)}
              placeholder="https://buymeacoffee.com/yourusername"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Crypto */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              <Bitcoin className="w-3.5 h-3.5 text-orange-400" /> {t('cryptoLabel')}
            </label>
            <input
              type="text"
              value={crypto}
              onChange={(e) => setCrypto(e.target.value)}
              placeholder={t('cryptoPlaceholder')}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {!anyConfigured && (
          <p className="text-xs text-amber-500/80">{t('notConfigured')}</p>
        )}
      </div>
    </div>
  )
}
