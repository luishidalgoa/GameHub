/**
 * La marca de GameHub, como SVG en línea.
 *
 * Va inline y no como <img src="/logo.svg"> a propósito: se pinta en el primer
 * render sin una petición extra y no parpadea al cambiar de tema.
 *
 * El cuerpo hereda `currentColor`, así que sigue al color del texto que lo
 * rodea. La cruceta y los botones se pintan con `hsl(var(--card))` — el mismo
 * token que el fondo de la barra lateral — para que parezcan recortados en vez
 * de dibujados; si algún día se usa sobre otro fondo, se pasa `cutout`.
 */
export function BrandMark({
  className = 'w-7 h-7',
  cutout = 'hsl(var(--card))',
}: {
  className?: string
  cutout?: string
}) {
  return (
    <svg
      viewBox="0 0 128 128"
      className={className}
      role="img"
      aria-label="GameHub"
      fill="none"
    >
      <rect x="6" y="28" width="116" height="72" rx="18" fill="currentColor" />
      {/* La pantalla: el único elemento con el rojo de marca fijo. */}
      <rect x="40" y="42" width="48" height="44" rx="5" fill="#dc2626" />
      <path
        d="M17 64 h16 M25 56 v16"
        stroke={cutout}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="99" cy="57" r="6" fill={cutout} />
      <circle cx="110" cy="70" r="6" fill={cutout} />
    </svg>
  )
}
