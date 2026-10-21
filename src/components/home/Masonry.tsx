/**
 * A grid that fills its width without forcing a row height or a column width:
 * each tile keeps its own shape and the columns run down as far as their tiles
 * go. The tiles carry their own bottom margin, so the gap is the same everywhere.
 */
export function Masonry({ children }: { children: React.ReactNode }) {
  return (
    <div className="columns-2 gap-4 sm:columns-3 xl:columns-4 2xl:columns-5 [column-fill:balance]">
      {children}
    </div>
  )
}
