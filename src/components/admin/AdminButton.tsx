import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * The buttons of the admin screens. One look for each role, so a page never mixes
 * a gradient action with a flat one for the same kind of action:
 *   primary   — the action the screen is for (save, fill, search, apply)
 *   secondary — the other actions (cancel, open, pick a file)
 *   danger    — removes or discards something
 *   ghost     — inline, low-emphasis actions inside a row or a card
 */
export type AdminButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<AdminButtonVariant, string> = {
  primary:   'bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-md shadow-violet-900/30 ring-1 ring-inset ring-white/10',
  secondary: 'bg-secondary border border-border text-foreground hover:bg-accent',
  danger:    'bg-gradient-to-br from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-md shadow-red-900/30 ring-1 ring-inset ring-white/10',
  ghost:     'text-muted-foreground hover:text-foreground hover:bg-accent',
}

// Fixed heights, so buttons in one row line up whatever their label is.
const SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
}

export interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant
  size?: keyof typeof SIZES
}

export function AdminButton({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: AdminButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
