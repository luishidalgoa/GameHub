// Titles the library carries in their local name, where the providers only know the
// English one. Each rule was checked against LaunchBox on the platform it is for: a
// name is added here only when the English title is found there with a confident
// match. A rule that is not verified does not belong in this list.

const ALIASES: { match: RegExp; English: string }[] = [
  // Korean and Japanese "Jin Samguk Mussang" is Dynasty Warriors (PS2 and DS checked).
  { match: /^Jin Samguk Mussang\b/i, English: 'Dynasty Warriors' },
  // The Korean release of Hyrule Warriors Legends (3DS).
  { match: /^Zelda Mussang - Hyruleui Jeonseoldeul$/i, English: 'Hyrule Warriors Legends' },
]

/** The English title of a localized one, or the title unchanged when no rule applies. */
export function titleAliasOf(title: string): string {
  for (const alias of ALIASES) {
    if (alias.match.test(title)) return title.replace(alias.match, alias.English)
  }
  return title
}
