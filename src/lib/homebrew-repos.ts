/**
 * Repos de GitHub con homebrew que la app de Switch consulta en la pestana
 * Homebrew. La app lee cada release y ofrece su .nro: no hay catalogo nuestro
 * de binarios, solo la lista de repos.
 *
 * La lista vive en Ajustes (clave `homebrew_repos`, JSON). Si no hay nada
 * guardado, se usa HOMEBREW_REPOS. Para anadir uno desde el admin basta con
 * "owner/name"; el repo tiene que publicar sus .nro como assets de sus releases.
 */
export const HOMEBREW_SETTING_KEY = 'homebrew_repos'

export const HOMEBREW_REPOS: readonly string[] = [
  'NextendoNetwork/Prelude-Nextendo',
  'luishidalgoa/green-nx',
  'ticohq/tico',
  'meganukebmp/Switch_90DNS_tester',
]

// owner/name con los caracteres que GitHub admite; cualquier otra cosa se
// descarta antes de llegar a la app.
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/** True when the text is a GitHub "owner/name" we are willing to store. */
export function isValidRepoName(repo: string): boolean {
  if (!REPO_PATTERN.test(repo)) return false
  // "." y ".." cumplen el patron, pero no son nombres de dueno ni de repo.
  return !repo.split('/').some((part) => part === '.' || part === '..')
}

export function validHomebrewRepos(repos: readonly string[] = HOMEBREW_REPOS): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const repo of repos) {
    if (!isValidRepoName(repo) || seen.has(repo)) continue
    seen.add(repo)
    out.push(repo)
  }
  return out
}

/**
 * The repos stored in Ajustes, or the built-in list when nothing is stored.
 * A stored value that is not a JSON array of strings counts as nothing stored,
 * so a bad row never empties the tab in the Switch app.
 */
export function parseStoredRepos(raw: string | null | undefined): string[] {
  if (raw == null || raw.trim() === '') return validHomebrewRepos()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((r) => typeof r === 'string')) return validHomebrewRepos()
    return validHomebrewRepos(parsed)
  } catch {
    return validHomebrewRepos()
  }
}

/** Serialises a repo list for Ajustes, keeping only valid, unique names. */
export function serializeRepos(repos: readonly string[]): string {
  return JSON.stringify(validHomebrewRepos(repos))
}

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

/** The .nro files among a release's assets, in the order GitHub lists them. */
export function nroFiles(assets: readonly ReleaseAsset[]): Array<{ name: string; url: string }> {
  return assets
    .filter((a) => a.name.toLowerCase().endsWith('.nro'))
    .map((a) => ({ name: a.name, url: a.browser_download_url }))
}
