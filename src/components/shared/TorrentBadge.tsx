/** Badge azul «torrent»: el juego solo existe como torrent de una fuente externa. */
export function TorrentBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Solo disponible por torrent"
      className={`pointer-events-none inline-flex items-center gap-1 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black shadow ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-black" />
      torrent
    </span>
  )
}
