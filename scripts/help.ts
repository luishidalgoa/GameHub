/* eslint-disable no-console */
// `npm run help` — guía rápida de los comandos del proyecto.
//
// El bloque clave es "Despliegue": el proceso de release en 3 bundles
// repetibles. Detalle completo en docs/deployment/ci-registry.md.

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = (s: string) => paint('1', s)
const dim = (s: string) => paint('2', s)
const cyan = (s: string) => paint('36', s)
const green = (s: string) => paint('32', s)
const yellow = (s: string) => paint('33', s)

function section(title: string) {
  console.log('')
  console.log(bold(title))
}

function cmd(name: string, desc: string) {
  console.log(`  ${cyan(name.padEnd(14))} ${dim(desc)}`)
}

function bundle(title: string, steps: Array<[string, string]>, notes: string[] = []) {
  console.log('')
  console.log('  ' + green(title))
  for (const [command, desc] of steps) {
    console.log('    ' + yellow('$ ' + command))
    console.log('      ' + dim(desc))
  }
  for (const note of notes) {
    console.log('    ' + dim('• ' + note))
  }
}

console.log('')
console.log(bold('GameHub') + dim(' — comandos disponibles   (npm run <script>)'))

section('🧑‍💻  Desarrollo')
cmd('dev', 'Servidor de desarrollo en http://localhost:3000')
cmd('build', 'Build de producción (Next.js)')
cmd('start', 'Arranca el build de producción')
cmd('lint', 'ESLint')

section('🗄️   Base de datos')
cmd('db:migrate', 'Crea/aplica migraciones — genera prisma/gamehub.db')
cmd('seed', 'Carga las plataformas por defecto')
cmd('db:studio', 'Prisma Studio (interfaz gráfica)')
cmd('db:export', 'Backup de la BBDD local')
cmd('db:import', 'Importa una BBDD y remapea rutas entre máquinas')

section('🎮  Contenido')
cmd('scan', 'Escanea las rutas configuradas y añade juegos')

section('🚀  Despliegue — proceso de release   ' + dim('(docs/deployment/ci-registry.md)'))
console.log('')
console.log('  ' + dim('Un push a main NO construye nada. Solo un tag vX.Y.Z dispara GitHub'))
console.log('  ' + dim('Actions → imagen en GHCR → Release en GitHub → la Pi se actualiza sola.'))

bundle(
  '1) Día a día   (trabajas, NO publicas)',
  [
    ['git add -A && git commit -m "..."', 'guarda tu trabajo'],
    ['git push', 'sube a main — no construye ni despliega'],
  ],
)

bundle(
  '2) Publicar versión   (dispara CI → GHCR + Release + deploy)',
  [
    ['npm version patch', 'fix 1.0.0 → 1.0.1   ·   minor = feature   ·   major = breaking'],
    ['git push --follow-tags', 'sube el commit Y el tag vX.Y.Z → arranca todo el flujo'],
  ],
  [
    'Primera versión (package.json ya en 1.0.0):  git tag v1.0.0 && git push origin v1.0.0',
    'Versión exacta:  npm version 1.4.2',
    'Release candidate (NO toca la Pi):  npm version prerelease --preid rc   → vX.Y.Z-rc.0',
  ],
)

bundle(
  '3) Operar la Raspberry Pi',
  [
    ['./deploy.sh update', 'actualización manual ya (sin esperar a Watchtower, ≤5 min)'],
    ['./deploy.sh status', 'estado del contenedor + uso de recursos'],
    ['./deploy.sh logs', 'logs en vivo'],
  ],
  [
    'Rollback: fija una etiqueta concreta en docker-compose.yml',
    '          (image: ghcr.io/luishidalgoa/gamehub:1.0.0) y ./deploy.sh update',
  ],
)

console.log('')
