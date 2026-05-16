export function LoadingGrid({ count = 24 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg overflow-hidden">
          <div className="aspect-[2/3] shimmer rounded-lg" />
          <div className="mt-2 h-3 shimmer rounded w-3/4" />
          <div className="mt-1 h-2.5 shimmer rounded w-1/2" />
        </div>
      ))}
    </div>
  )
}
