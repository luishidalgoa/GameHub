'use client'

import { useState } from 'react'

/** Control deslizante de «Metadatos al menos», con el porcentaje a la vista. */
export function MetaRange({ name, defaultValue }: { name: string; defaultValue: number }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={`${name}-input`} className="text-sm text-muted-foreground">Metadatos al menos</label>
        <output htmlFor={`${name}-input`} className="text-sm font-semibold tabular-nums">{value} %</output>
      </div>
      <input
        id={`${name}-input`}
        name={name}
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={e => setValue(Number(e.target.value))}
        className="w-full accent-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p className="text-xs text-muted-foreground">
        Suma de los campos rellenos: portada 20, descripción 15, nota 15, año 10, género 10, desarrollador 10, editora 10, capturas 5, tráiler 5.
      </p>
    </div>
  )
}
