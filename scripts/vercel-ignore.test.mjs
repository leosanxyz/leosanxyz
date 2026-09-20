import assert from 'node:assert/strict'
import { test } from 'node:test'
import { affectsSite, shouldSkipBuild } from './vercel-ignore.mjs'

test('canvas and project docs skip the site; shared inputs and site content rebuild', () => {
  for (const path of ['apps/xp-canvas/client/App.tsx', 'AGENTS.md', 'ARCHITECTURE.md', 'docs/guide.md']) assert.equal(affectsSite(path), false, path)
  for (const path of ['src/app/page.tsx', 'public/img/art.png', 'content/blog/post.md', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'vercel.json', 'scripts/vercel-ignore.mjs']) assert.equal(affectsSite(path), true, path)
})

test('all changes since the deployment are considered, including deleted or renamed site files', () => {
  const sha = 'a'.repeat(40)
  assert.equal(shouldSkipBuild(sha, () => 'apps/xp-canvas/client/App.tsx\0AGENTS.md\0'), true)
  assert.equal(shouldSkipBuild(sha, () => 'apps/xp-canvas/client/App.tsx\0src/app/page.tsx\0'), false)
  assert.equal(shouldSkipBuild(sha, () => ''), true)
})

test('missing or unavailable previous commit conservatively builds', () => {
  assert.equal(shouldSkipBuild(undefined), false)
  assert.equal(shouldSkipBuild('HEAD~1'), false)
  assert.equal(shouldSkipBuild('a'.repeat(40), () => { throw new Error('shallow clone') }), false)
})
