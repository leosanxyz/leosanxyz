import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'

// A capture is immutable. Re-running --apply reuses matching remote copies,
// but refuses conflicting files/documents and never replaces a canvas.
const [mode, source, destination, backupDir, secretFile, ...boardIds] = process.argv.slice(2)
if (!['--capture', '--apply'].includes(mode) || !source || !destination || !backupDir || !secretFile || !boardIds.length) {
	throw new Error('Usage: node scripts/migrate-canvases.mjs <--capture|--apply> <localhost-source> <destination> <private-backup-dir> <teacher-secrets.json> <board-id> [...]')
}
assert(['127.0.0.1', 'localhost'].includes(new URL(source).hostname), 'Source must be the local canvas server')
assert(new URL(destination).protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(new URL(destination).hostname), 'Remote destination requires HTTPS')
assert.notEqual(new URL(source).origin, new URL(destination).origin)
assert(path.isAbsolute(backupDir), 'Use an absolute, private backup path')
assert(boardIds.every((id) => /^[a-zA-Z0-9_-]{1,64}$/.test(id)) && new Set(boardIds).size === boardIds.length, 'Invalid or duplicate board ids')

const manifestPath = path.join(backupDir, 'manifest.json')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function json(response) {
	if (!response.ok) throw new Error(`HTTP ${response.status} at ${new URL(response.url).pathname}: ${(await response.text()).slice(0,180)}`)
	return response.json()
}
const uploadPath = (value) => {
	if (typeof value !== 'string') return null
	try {
		const url = new URL(value, source)
		const match = /^\/api\/uploads\/([a-zA-Z0-9_-]{12,64})$/.exec(url.pathname)
		return match ? { id: match[1], pathname: url.pathname } : null
	} catch { return null }
}
function documentRecords(snapshot) { return snapshot.documents.map((d) => d.state).sort((a, b) => a.id.localeCompare(b.id)) }
function prepareSnapshot(snapshot, assets) {
	return JSON.parse(JSON.stringify(snapshot, (_key, value) => {
		const upload = uploadPath(value)
		if (upload) { assets.add(upload.id); return upload.pathname }
		return value
	}))
}
async function saveManifest(manifest) {
	await writeFile(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2), { mode: 0o600 })
	await rename(`${manifestPath}.tmp`, manifestPath)
}

if (mode === '--capture') {
	assert.equal((await json(await fetch(`${source}/api/portal/session`))).mode, 'local', 'Do not capture a student QA database')
	await mkdir(backupDir, { mode: 0o700 }) // Refuse to overwrite an earlier capture.
	await mkdir(path.join(backupDir, 'assets'), { mode: 0o700 })
	const manifest = { version: 1, source, destination, capturedAt: new Date().toISOString(), boards: [], assets: [], applied: {} }
	const assets = new Set()
	for (const id of boardIds) {
		const exported = await json(await fetch(`${source}/api/boards/${id}/export`))
		assert.equal(exported.board.id, id)
		await writeFile(path.join(backupDir, `${id}.original.json`), JSON.stringify(exported), { mode: 0o600, flag: 'wx' })
		const snapshot = prepareSnapshot(exported.snapshot, assets)
		const contents = JSON.stringify(snapshot)
		await writeFile(path.join(backupDir, `${id}.json`), contents, { mode: 0o600, flag: 'wx' })
		let thumbnail = false
		if (exported.board.thumbnailAt) {
			const response = await fetch(`${source}/api/boards/${id}/thumbnail`)
			assert(response.ok, `Missing thumbnail for ${id}`)
			await writeFile(path.join(backupDir, `${id}.png`), Buffer.from(await response.arrayBuffer()), { mode: 0o600, flag: 'wx' })
			thumbnail = true
		}
		manifest.boards.push({ id, name: exported.board.name, records: snapshot.documents.length, shapes: snapshot.documents.filter((d) => d.state.typeName === 'shape').length, sha256: digest(contents), thumbnail })
	}
	for (const id of assets) {
		const response = await fetch(`${source}/api/uploads/${id}`)
		assert(response.ok, `Missing source asset ${id}: ${response.status}`)
		const bytes = Buffer.from(await response.arrayBuffer())
		await writeFile(path.join(backupDir, 'assets', id), bytes, { mode: 0o600, flag: 'wx' })
		manifest.assets.push({ id, bytes: bytes.length, mimeType: response.headers.get('content-type'), sha256: digest(bytes) })
	}
	await saveManifest(manifest)
	console.log(JSON.stringify({ capturedAt: manifest.capturedAt, boards: manifest.boards, assets: manifest.assets.length, assetBytes: manifest.assets.reduce((total, asset) => total + asset.bytes, 0), backupDir }, null, 2))
} else {
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
	assert.equal(manifest.source, source); assert.equal(manifest.destination, destination)
	assert.deepEqual(manifest.boards.map((b) => b.id), boardIds, 'Apply exactly the captured board selection')
	const { PORTAL_BOOTSTRAP_PASSWORD: password } = JSON.parse(await readFile(secretFile, 'utf8'))
	assert(typeof password === 'string' && password.length >= 15)
	const login = await fetch(`${destination}/api/portal/login`, { method: 'POST', headers: { origin: destination, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'leo', password }) })
	assert.equal((await json(login)).user.role, 'teacher')
	const cookie = login.headers.get('set-cookie')?.split(';')[0]
	assert(cookie, 'Missing authenticated session')
	const request = (endpoint, options = {}) => fetch(`${destination}${endpoint}`, { ...options, headers: { cookie, origin: destination, ...options.headers } })
	try {
		const existing = (await json(await request('/api/library'))).boards.filter((b) => !b.trashedAt)
		for (const asset of manifest.assets) {
			const bytes = await readFile(path.join(backupDir, 'assets', asset.id))
			assert.equal(digest(bytes), asset.sha256, 'Source backup checksum mismatch')
			const remote = await request(`/api/uploads/${asset.id}`)
			if (remote.status === 404) {
				await json(await request(`/api/uploads/${asset.id}`, { method: 'POST', headers: { 'content-type': asset.mimeType, 'content-length': String(bytes.length), 'x-file-name': encodeURIComponent(asset.id) }, body: bytes }))
			} else {
				assert(remote.ok)
				assert.equal(digest(Buffer.from(await remote.arrayBuffer())), asset.sha256, 'Refusing to overwrite a different remote asset')
			}
			const verified = await request(`/api/uploads/${asset.id}`)
			assert(verified.ok)
			assert.equal(digest(Buffer.from(await verified.arrayBuffer())), asset.sha256, 'Uploaded asset checksum mismatch')
		}
		for (const board of manifest.boards) {
			const text = await readFile(path.join(backupDir, `${board.id}.json`), 'utf8')
			assert.equal(digest(text), board.sha256, 'Snapshot backup checksum mismatch')
			const snapshot = JSON.parse(text)
			const sameName = existing.filter((b) => b.name === board.name)
			assert(sameName.length <= 1, 'Ambiguous remote class; select the destination explicitly')
			let remoteBoard = manifest.applied[board.id] ?? sameName[0]
			if (!remoteBoard) {
				remoteBoard = await json(await request('/api/boards/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, name: board.name, snapshot }) }))
				manifest.applied[board.id] = remoteBoard
				await saveManifest(manifest)
			}
			const exported = await json(await request(`/api/boards/${remoteBoard.id}/export`))
			assert.deepEqual(documentRecords(exported.snapshot), documentRecords(snapshot), `Remote document mismatch: ${board.name}`)
			if (board.thumbnail && !exported.board.thumbnailAt) {
				const image = await readFile(path.join(backupDir, `${board.id}.png`))
				const response = await request(`/api/boards/${remoteBoard.id}/thumbnail`, { method: 'PUT', headers: { 'content-type': 'image/png', 'content-length': String(image.length) }, body: image })
				assert.equal(response.status, 204)
			}
			const access = await json(await request(`/api/portal/boards/${remoteBoard.id}/access`))
			assert.deepEqual(access.grants, [], 'Class access must remain unassigned')
			manifest.applied[board.id] = remoteBoard
			await saveManifest(manifest)
			console.log(JSON.stringify({ name: board.name, url: `${destination}/board/${remoteBoard.id}`, records: snapshot.documents.length, verified: true, grants: 0 }))
		}
		console.log(`Verified ${manifest.boards.length} class copies and ${manifest.assets.length} asset checksums. Originals were not modified.`)
	} finally { await request('/api/portal/logout', { method: 'POST' }) }
}
