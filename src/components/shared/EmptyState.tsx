import { Gamepad2 } from 'lucide-react'

interface Props {
  title?: string
  description?: string
}

export function EmptyState({
  title = 'No games found',
  description = 'Try adjusting your filters or run a scan to import your ROM collection.',
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Gamepad2 className="w-12 h-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-semibold text-muted-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground/70 mt-1 max-w-xs">{description}</p>
    </div>
  )
}
