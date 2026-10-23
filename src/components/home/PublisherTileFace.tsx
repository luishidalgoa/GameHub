'use client'

import type { PublisherTileData } from '@/lib/home-data'
import { PublisherBackdrop } from './PublisherBackdrop'
import type { Place } from '@/lib/publisher-art'

/** An element the owner placed: its centre, and its box in percent of the tile. */
export const placed = (p: Place): React.CSSProperties => ({
  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
  width: p.w !== undefined ? `${p.w}%` : 'auto',
  height: p.h !== undefined ? `${p.h}%` : 'auto',
  maxWidth: 'none', transform: 'translate(-50%, -50%)',
})

export type TileElement = 'character' | 'logo'

/** The owner's editing hooks, for the admin preview only. The home never passes them. */
export interface TileEdit {
  /** The element was pressed: move it. */
  onMove: (el: TileElement, e: React.PointerEvent<HTMLElement>) => void
  /** The corner handle was pressed: resize it. */
  onResize: (el: TileElement, e: React.PointerEvent<HTMLElement>) => void
  /** The element with the outline, if any. */
  selected: TileElement | null
  /** The element got the keyboard focus. */
  onSelect: (el: TileElement) => void
}

/**
 * A tile's face: the backdrop, the character, the logo or the name, in the template the
 * owner chose. It is the same in the home rail and in the admin preview, so what the owner
 * arranges is what the home shows. Pass `edit` to arrange it.
 */
export function PublisherTileFace({ publisher, gamesLabel, edit }: {
  publisher: PublisherTileData
  gamesLabel: string
  edit?: TileEdit
}) {
  const { key, name, logo, plainLogo, character, colors, layout, template, backdrop } = publisher
  const [c1, c2] = [colors[0] ?? '#3a3a55', colors[1] ?? '#14141f']

  const layers = (
    <>
      <PublisherBackdrop style={backdrop} c1={c1} c2={c2} id={`pt-${key.replace(/[^a-z0-9]/g, '')}`} />

      {character && layout?.character && (
        edit ? (
          <Arranged el="character" place={layout.character} edit={edit}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={character} alt="" draggable={false} className="block h-auto w-full select-none" />
          </Arranged>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character} alt="" loading="lazy" decoding="async" style={placed(layout.character)}
               className="object-cover object-top drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)] transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]" />
        )
      )}
      {character && !layout?.character && (
        // Cut at the chest, the way the store does it: the top of the figure is
        // kept, the rest runs off the bottom of the tile behind the logo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character} alt="" loading="lazy" decoding="async"
             className="absolute inset-x-[8%] top-[9%] bottom-[25%] h-auto w-[84%] max-w-none object-cover object-top drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)] transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />
      {/* Behind a centered logo: a soft dark pool, so a pale logo reads on any gradient. */}
      {logo && !character && (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 34% at 50% 50%, rgba(0,0,0,0.45), transparent)' }} />
      )}
      {template === 'franja' && (
        // A solid band in the brand's first color, behind the logo.
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[34%]" style={{ background: c1 }} />
      )}
      {template === 'marco' && (
        <div aria-hidden="true" className="absolute inset-3 rounded-lg ring-1 ring-white/50" />
      )}

      {logo && layout?.logo ? (
        edit ? (
          <Arranged el="logo" place={layout.logo} edit={edit}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={name} draggable={false} className={`block h-full select-none object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] ${layout.logo.w !== undefined ? 'w-full' : 'w-auto'} ${plainLogo ? '' : 'brightness-0 invert'}`} />
          </Arranged>
        ) : (
          // The owner placed the logo: it keeps its place, and the name line goes under it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={name} loading="lazy" decoding="async" style={placed(layout.logo)}
               className={`object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] ${plainLogo ? '' : 'brightness-0 invert'}`} />
        )
      ) : logo ? (
        <div className={`absolute inset-x-0 flex flex-col items-center px-5 text-center ${character ? 'bottom-4' : 'inset-y-0 justify-center'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={name} loading="lazy" decoding="async"
               className={`max-w-[82%] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] ${plainLogo ? '' : 'brightness-0 invert'} ${character ? 'w-auto max-h-8' : 'max-h-28 w-[82%] transition-transform duration-700 group-hover:scale-105'}`} />
          <p className="mt-2 text-xs text-white/60">{gamesLabel}</p>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 p-4 text-center">
          <p className="text-balance text-2xl font-black uppercase leading-none tracking-tight drop-shadow-lg">{name}</p>
          <p className="mt-2 text-xs text-white/60">{gamesLabel}</p>
        </div>
      )}
    </>
  )

  // Al arreglar la tesela, las capas de fondo no reciben clics: solo el logo y el personaje.
  return edit ? <div className="pointer-events-none absolute inset-0">{layers}</div> : layers
}

/** An arranged element in edit mode: it moves with a press, and a corner handle resizes it. */
function Arranged({ el, place, edit, children }: { el: TileElement; place: Place; edit: TileEdit; children: React.ReactNode }) {
  const on = edit.selected === el
  const label = el === 'logo' ? 'Logo' : 'Personaje'
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}: arrastra para moverlo, o usa las flechas. Esquina para cambiar el tamaño.`}
      aria-pressed={on}
      onPointerDown={e => edit.onMove(el, e)}
      onFocus={() => edit.onSelect(el)}
      style={placed(place)}
      className={`pointer-events-auto ${el === 'logo' ? 'z-20' : 'z-10'} cursor-move touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${on ? 'outline outline-2 outline-violet-400' : 'outline outline-1 outline-dashed outline-white/40'}`}
    >
      {children}
      <span
        role="presentation"
        onPointerDown={e => { e.stopPropagation(); edit.onResize(el, e) }}
        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-violet-400"
      />
    </div>
  )
}
