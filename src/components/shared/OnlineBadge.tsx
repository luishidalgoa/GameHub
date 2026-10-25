/** Badge verde «online»: el juego tiene juego en línea en un proyecto de su plataforma. */
export function OnlineBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Juego en línea disponible"
      className={`pointer-events-none inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black shadow ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-black" />
      online
    </span>
  )
}
