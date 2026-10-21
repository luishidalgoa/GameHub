import { gameGroupKey } from './rom-tags'
import { switchGroupKey } from './scanner/titleid'

/**
 * The one group-key rule (#77). A Switch folder keys on the Title ID its files
 * share (`tid:`); everything else keys on the normalized name (`name:`), taken
 * from the folder name when there is one. Every scan path goes through here, so
 * the same game gets the same key whichever way it was found.
 */
export function canonicalGroupKey(input: { folderName?: string; fileNames: string[]; switchMode: boolean }): string {
  const tid = input.switchMode ? switchGroupKey(input.fileNames) : null
  return tid ?? gameGroupKey(input.folderName ?? input.fileNames[0] ?? '')
}
