import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Vercel: exit 0 skips the build; exit 1 continues it.
export function affectsSite(path) {
  if (path.startsWith('apps/xp-canvas/') || path.startsWith('.codex/')) return false
  if (path.startsWith('docs/')) return false
  if (!path.includes('/') && /\.md$/i.test(path)) return false
  return true
}

export function shouldSkipBuild(previousSha, readDiff = (sha) => execFileSync(
  'git', ['diff', '--name-only', '--no-renames', '-z', sha, 'HEAD', '--'], { encoding: 'utf8' },
)) {
  if (!previousSha || !/^[a-f0-9]{40,64}$/i.test(previousSha)) return false
  try {
    return !readDiff(previousSha).split('\0').filter(Boolean).some(affectsSite)
  } catch {
    return false
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const skip = shouldSkipBuild(process.env.VERCEL_GIT_PREVIOUS_SHA)
  console.log(skip ? 'No site changes: skipping Vercel build.' : 'Site/shared changes or unavailable history: building.')
  process.exit(skip ? 0 : 1)
}
