import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5177'
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Only use isolated localhost state.')
function client() {
	let cookie = ''
	return async (path, method = 'GET', data, origin = base) => {
		const response = await fetch(`${base}/api/portal/${path}`, { method, headers: { origin, cookie, ...(data ? { 'content-type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) })
		if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
		return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') }
	}
}
const teacher = client(), a = client(), b = client(), anonymous = client()
const stamp = randomUUID().slice(0, 8).toUpperCase(), username = `PASS${stamp}`, other = `OTHER${stamp}`, password = 'test-passphrase-only-local'
assert.equal((await anonymous('pass')).status, 401)
assert.equal((await teacher('login', 'POST', { username: 'leo', password: process.env.PORTAL_QA_PASSWORD ?? 'qa-teacher-password-only-local' })).status, 200)
assert.equal((await teacher('students', 'POST', { students: [{ username, name: 'Prueba del pase' }, { username: other, name: 'Otro alumno de prueba' }] })).status, 201)
assert.equal((await a('login', 'POST', { username, password: username })).status, 200)
assert.equal((await a('pass')).status, 403)
assert.equal((await a('password', 'POST', { password })).status, 200)
assert.equal((await b('login', 'POST', { username: other, password: other })).status, 200)
assert.equal((await b('password', 'POST', { password })).status, 200)
const initial = await a('pass')
assert.equal(initial.status, 200); assert.equal(initial.cache, 'no-store'); assert.equal(initial.data.completed, false)
const draft = { ...initial.data.draft, name: 'Mi apodo', skin: 'long-dark', finish: 'prism', brightness: 12, hologram: { pattern: 'stars', intensity: 84, phase: 0.32, area: 'subject', hue: 42 }, step: 3, opened: true, signature: { kind: 'drawn', strokes: [[[20, 100], [100, 45], [160, 220]], [[250, 180], [270, 60], [300, 180]]] }, stickers: [{ id: 'sticker-test', art: 'moon', x: 23, y: 68, rotation: -14, scale: 1.3 }] }
const save = (value = draft, revision = 0, completed = false) => ({ draft: value, revision, completed })
assert.equal((await a('pass', 'PUT', save(), 'https://hostile.test')).status, 403)
assert.equal((await a('pass', 'PUT', save({ ...draft, skin: 'https://attacker.test' }))).status, 400)
assert.equal((await a('pass', 'PUT', save({ ...draft, signature: { kind: 'drawn', strokes: [[[0, 0], [900, 0]]] } }))).status, 400)
assert.equal((await a('pass', 'PUT', save({ ...draft, signature: '<svg onload="alert(1)">' }))).status, 400)
assert.equal((await a('pass', 'PUT', save({ ...draft, hologram: { pattern: 'grid', intensity: 101, phase: 0 } }))).status, 400)
assert.equal((await a('pass', 'PUT', save({ ...draft, hologram: { ...draft.hologram, hue: 361 } }))).status, 400)
assert.equal((await a('pass', 'PUT', save({ ...draft, hologram: { ...draft.hologram, area: 'https://attacker.test/mask.svg' } }))).status, 400)
assert.equal((await a('pass', 'PUT', { ...save(), userId: 'teacher', intro: { message: 'Attempted overwrite' } })).status, 200)
const restored = await a('pass')
assert.deepEqual(restored.data.draft, draft); assert.equal(restored.data.revision, 1)
assert.equal(restored.data.intro.message, initial.data.intro.message)
assert.equal((await a('pass', 'PUT', save())).status, 409)
assert.equal((await a(`pass/${other}`)).status, 403)
assert.equal((await a('review-passes')).status, 403)
const isolated = await b('pass'); assert.equal(isolated.data.revision, 0); assert.equal(isolated.data.completed, false)
assert.equal((await a('pass', 'PUT', save(draft, 1, true))).status, 200)
assert.equal((await a('pass')).data.completed, true)
assert.equal((await a('logout', 'POST')).status, 200)
assert.equal((await a('login', 'POST', { username, password })).status, 200)
assert.deepEqual((await a('pass')).data.draft, draft)
assert.equal((await a('pass', 'PUT', save({ ...draft, step: 1 }, 2, false))).status, 200)
assert.equal((await a('pass')).data.completed, true)
console.log('PASS: auth, forced password, private cache, validated draft and drawn signature, CSRF, optimistic revision, account isolation, finish, signature re-login persistence, re-edit.')
console.log(`Synthetic browser QA account: ${other} / ${password}`)
