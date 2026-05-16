import { PlatformCard } from './PlatformCard'
import type { Platform } from '@/types/platform'

interface Props {
  platforms: Platform[]
}

export function ConsoleGrid({ platforms }: Props) {
  if (platforms.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p className="text-lg">No platforms found.</p>
        <p className="text-sm mt-1">Run a scan from the Admin panel to populate your library.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {platforms.map((p) => (
        <PlatformCard key={p.slug} platform={p} />
      ))}
    </div>
  )
}
