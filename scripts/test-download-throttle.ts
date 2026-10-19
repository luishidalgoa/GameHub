/** Comprobación del límite de descargas. Ejecutar: npx tsx scripts/test-download-throttle.ts */
import {
  isExemptFromDownloadLimit,
  parseDownloadLimitKib,
  throttleWebStream,
  type PacingClock,
} from '../src/lib/download-throttle'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`ok    ${name}`)
  else { failures++; console.log(`FAIL  ${name} ${detail}`) }
}

// ── Lectura del ajuste ──────────────────────────────────────────────────────
check('vacío = sin límite', parseDownloadLimitKib(null) === 0 && parseDownloadLimitKib('') === 0)
check('cero y negativo = sin límite', parseDownloadLimitKib('0') === 0 && parseDownloadLimitKib('-5') === 0)
check('texto = sin límite', parseDownloadLimitKib('rápido') === 0)
check('500 KiB/s', parseDownloadLimitKib('500') === 500)
check('se trunca a entero', parseDownloadLimitKib('12.9') === 12)

// ── Quién queda exento ──────────────────────────────────────────────────────
check('GameHubNX exento', isExemptFromDownloadLimit('GameHubNX/1.0.0'))
check('navegador no exento', !isExemptFromDownloadLimit('Mozilla/5.0 (X11; Linux x86_64)'))
check('sin User-Agent no exento', !isExemptFromDownloadLimit(null) && !isExemptFromDownloadLimit(undefined))
check('prefijo parecido no exento', !isExemptFromDownloadLimit('XGameHubNX/1.0.0'))

// ── Ritmo: reloj falso, el sleep solo avanza el reloj ──────────────────────
function fakeClock(): PacingClock & { elapsed: () => number } {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms: number) => { t += ms },
    elapsed: () => t,
  }
}

function sourceOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = stream.getReader()
  const out: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(value)
  }
  return out
}

async function main() {
  // 3 trozos de 200 KiB a 100 KiB/s: 600 KiB tardan 6 s con el reloj falso.
  const kib = 1024
  const chunks = [0, 1, 2].map((i) => new Uint8Array(200 * kib).fill(i + 1))
  const clock = fakeClock()
  const paced = await drain(throttleWebStream(sourceOf(chunks), 100 * kib, clock))
  const total = paced.reduce((n, c) => n + c.byteLength, 0)
  check('todos los bytes llegan', total === 600 * kib, `got ${total}`)
  const expected = new Uint8Array(600 * kib)
  chunks.forEach((c, i) => expected.set(c, i * 200 * kib))
  const actual = new Uint8Array(total)
  let offset = 0
  for (const c of paced) { actual.set(c, offset); offset += c.byteLength }
  check('el contenido llega íntegro y en orden',
    actual.length === expected.length && actual.every((b, i) => b === expected[i]))
  check('el ritmo se cumple: 6 s para 600 KiB a 100 KiB/s',
    Math.abs(clock.elapsed() - 6000) < 1, `elapsed ${clock.elapsed()} ms`)

  // Sin cuello de botella el reloj no se mueve.
  const fast = fakeClock()
  await drain(throttleWebStream(sourceOf(chunks), 1e12, fast))
  check('un tope enorme no espera', fast.elapsed() === 0, `elapsed ${fast.elapsed()} ms`)

  // Trozos de como mucho 64 KiB: un bloque grande se reparte.
  const big = fakeClock()
  const pieces = await drain(throttleWebStream(sourceOf([new Uint8Array(1024 * kib)]), 512 * kib, big))
  check('un bloque de 1 MiB sale en trozos de 64 KiB',
    pieces.length === 16 && pieces.every((p) => p.byteLength === 64 * kib), `pieces ${pieces.length}`)
  check('1 MiB a 512 KiB/s tarda 2 s', Math.abs(big.elapsed() - 2000) < 1, `elapsed ${big.elapsed()}`)

  if (failures > 0) {
    console.log(`\n${failures} comprobación(es) fallida(s)`)
    process.exit(1)
  }
  console.log('\ntodo correcto')
}

void main()
