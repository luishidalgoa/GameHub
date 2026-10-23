import { describe, expect, it } from 'vitest'
import {
  HOMEBREW_REPOS,
  isValidRepoName,
  nroFiles,
  parseStoredRepos,
  serializeRepos,
  validHomebrewRepos,
} from '@/lib/homebrew-repos'

describe('isValidRepoName', () => {
  it('accepts owner/name with GitHub characters', () => {
    expect(isValidRepoName('luishidalgoa/green-nx')).toBe(true)
    expect(isValidRepoName('owner.name/repo_1')).toBe(true)
  })

  it('rejects paths, dot segments and anything else', () => {
    expect(isValidRepoName('owner')).toBe(false)
    expect(isValidRepoName('owner/repo/extra')).toBe(false)
    expect(isValidRepoName('../repo')).toBe(false)
    expect(isValidRepoName('owner/..')).toBe(false)
    expect(isValidRepoName('owner/repo name')).toBe(false)
  })
})

describe('parseStoredRepos', () => {
  it('falls back to the built-in list when nothing is stored', () => {
    expect(parseStoredRepos(null)).toEqual(validHomebrewRepos(HOMEBREW_REPOS))
    expect(parseStoredRepos('   ')).toEqual(validHomebrewRepos(HOMEBREW_REPOS))
  })

  it('reads a stored JSON list and drops invalid or duplicate entries', () => {
    expect(parseStoredRepos('["a/b","a/b","bad","../x","c/d"]')).toEqual(['a/b', 'c/d'])
  })

  it('treats a malformed value as nothing stored', () => {
    expect(parseStoredRepos('no json')).toEqual(validHomebrewRepos(HOMEBREW_REPOS))
    expect(parseStoredRepos('{"a":1}')).toEqual(validHomebrewRepos(HOMEBREW_REPOS))
    expect(parseStoredRepos('[1,2]')).toEqual(validHomebrewRepos(HOMEBREW_REPOS))
  })

  it('keeps an explicitly emptied list empty', () => {
    expect(parseStoredRepos('[]')).toEqual([])
  })
})

describe('serializeRepos', () => {
  it('stores only valid, unique names', () => {
    expect(serializeRepos(['a/b', 'a/b', 'nope'])).toBe('["a/b"]')
  })
})

describe('nroFiles', () => {
  it('keeps only .nro assets, case-insensitively', () => {
    const files = nroFiles([
      { name: 'app.nro', browser_download_url: 'https://x/app.nro' },
      { name: 'Tool.NRO', browser_download_url: 'https://x/tool.nro' },
      { name: 'source.zip', browser_download_url: 'https://x/source.zip' },
      { name: 'app.nro.sha256', browser_download_url: 'https://x/app.sha' },
    ])
    expect(files).toEqual([
      { name: 'app.nro', url: 'https://x/app.nro' },
      { name: 'Tool.NRO', url: 'https://x/tool.nro' },
    ])
  })
})
