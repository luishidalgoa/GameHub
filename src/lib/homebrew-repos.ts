/**
 * Repos de GitHub con homebrew que la app de Switch consulta en la pestana
 * Homebrew. La app lee cada release y ofrece su .nro: no hay catalogo nuestro
 * de binarios, solo la lista de repos.
 *
 * Para anadir uno, basta con una linea "owner/name" en la lista. El repo tiene
 * que publicar sus .nro como assets de sus releases.
 */
export const HOMEBREW_REPOS: readonly string[] = [
  'NextendoNetwork/Prelude-Nextendo',
  'luishidalgoa/green-nx',
  'ticohq/tico',
]

// owner/name con los caracteres que GitHub admite; cualquier otra cosa se
// descarta antes de llegar a la app.
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export function validHomebrewRepos(repos: readonly string[] = HOMEBREW_REPOS): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const repo of repos) {
    if (!REPO_PATTERN.test(repo) || seen.has(repo)) continue
    // "." y ".." cumplen el patron, pero no son nombres de dueno ni de repo.
    if (repo.split('/').some((part) => part === '.' || part === '..')) continue
    seen.add(repo)
    out.push(repo)
  }
  return out
}
