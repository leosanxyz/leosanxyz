import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

// Recorre la cápsula completa: sellar, apostar y cambiar la apuesta, cierre a la hora, sorteo, premio y reparto.
// Crea cuentas y documentos ficticios: usa un servidor de QA aislado.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5177'
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Capsule smoke requires localhost and isolated QA state.')
const shots = process.env.CAPSULE_SHOTS ?? '/tmp/capsula-smoke'
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
const QUESTIONS = [
	['¿Cuánto es 2 + 2?', ['3', '4', '5', '6'], 1],
	['¿Qué color resulta de azul y amarillo?', ['Verde', 'Rojo', 'Morado', 'Gris'], 0],
	['¿Cuántos lados tiene un hexágono?', ['Cinco', 'Ocho', 'Seis', 'Siete'], 2],
	['¿Qué planeta es el más grande?', ['Marte', 'Venus', 'Tierra', 'Júpiter'], 3],
	['¿Qué capital tiene México?', ['Ciudad de México', 'Monterrey', 'Puebla', 'Mérida'], 0],
]
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
	const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
	assert.equal((await teacher.request.post('/api/portal/login', { data: { username: 'leo', password: process.env.PORTAL_QA_PASSWORD ?? 'qa-teacher-password-only-local' } })).status(), 200)
	const board = await (await teacher.request.post('/api/boards', { data: { name: 'Cápsula QA' } })).json()
	const endpoint = `/api/boards/${board.id}/interactions`

	// Cuatro alumnos: tres con 500 puntos y Nico con cero.
	const names = ['Dana', 'Sofi', 'Mateo', 'Nico']
	const students = {}
	for (const name of names) {
		const username = `Q${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
		assert.equal((await teacher.request.post('/api/portal/students', { data: { students: [{ username, name }] } })).status(), 201)
		const id = (await (await teacher.request.get('/api/portal/roster')).json()).students.find((s) => s.username === username).id
		const context = await browser.newContext({ baseURL, viewport: { width: 1360, height: 980 } })
		assert.equal((await context.request.post('/api/portal/login', { data: { username, password: username } })).status(), 200)
		assert.equal((await context.request.post('/api/portal/password', { data: { password: 'qa-capsule-password' } })).status(), 200)
		const pass = await (await context.request.get('/api/portal/pass')).json()
		assert.equal((await context.request.put('/api/portal/pass', { data: { draft: { ...pass.draft, step: 4, opened: true, signature: { kind: 'drawn', strokes: [[[20, 100], [100, 45], [160, 220]]] } }, revision: pass.revision, completed: true } })).status(), 200)
		students[name] = { id, context, points: async () => (await (await context.request.get('/api/portal/points')).json()).points }
	}
	assert.equal((await teacher.request.put(`/api/portal/boards/${board.id}/access`, { data: { grants: names.map((name) => ({ kind: 'user', subjectId: students[name].id })) } })).status(), 200)

	const page = await teacher.newPage()
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(`/board/${board.id}`)
	await page.waitForFunction(() => !!window.__xpCanvasEditor)
	// Una pregunta paga una sola vez, así que cada alumno con puntos responde su propio juego de cinco.
	const paid = ['Dana', 'Sofi', 'Mateo']
	const questionIds = await page.evaluate(({ questions, owners }) => {
		const editor = window.__xpCanvasEditor
		return Object.fromEntries(owners.map((owner, row) => [owner, questions.map(([question, answers, correct], i) => {
			const id = `shape:q-${crypto.randomUUID()}`
			editor.createShape({ id, type: 'question', x: 2000 + i * 420, y: row * 320, props: { question, answers, correct, points: 100, revision: 'qa', answered: [] } })
			return id
		})]))
	}, { questions: QUESTIONS, owners: paid })
	for (const name of names) {
		const studentPage = await students[name].context.newPage()
		studentPage.on('pageerror', (error) => errors.push(error.message))
		await studentPage.goto(`/board/${board.id}`)
		await studentPage.waitForFunction((count) => window.__xpCanvasEditor?.getCurrentPageShapes().filter((shape) => shape.type === 'question').length === count, QUESTIONS.length * paid.length)
		students[name].page = studentPage
	}
	for (const name of paid) {
		assert.equal((await teacher.request.post(endpoint, { data: { action: 'permission', userId: students[name].id, allowed: true } })).status(), 200)
		for (const [i, shapeId] of questionIds[name].entries()) {
			assert.equal((await students[name].context.request.post(endpoint, { data: { action: 'answer', shapeId, revision: 'qa', answer: QUESTIONS[i][2] } })).status(), 200)
		}
		for (let i = 0; i < 50 && await students[name].points() < 500; i++) await wait(200)
		assert.equal(await students[name].points(), 500, `${name} earns 500 points`)
	}
	assert.equal(await students.Nico.points(), 0)

	// Leo escribe la cápsula, la sella con una hora futura.
	const opensAt = Date.now() + 60 * 60 * 1000
	const capsuleId = await page.evaluate((opensAt) => {
		const editor = window.__xpCanvasEditor, id = `shape:capsula-${crypto.randomUUID()}`
		editor.createShape({ id, type: 'capsule', x: 100, y: 100, props: { question: 'El jugador llega a la puerta sin llave. ¿Qué arregla el bug?', outcomes: ['Que no pase nada hasta tener la llave', 'Un estado «bloqueada» en el rombo del diagrama', 'Quitar la puerta del nivel'], opensAt, revision: 'cap-1', counts: [0, 0, 0], stakes: [0, 0, 0] } })
		return id
	}, opensAt)
	const bet = (name, data) => students[name].context.request.post(endpoint, { data: { action: 'capsule-bet', shapeId: capsuleId, revision: 'cap-1', ...data } })
	// El shape viaja por WebSocket; el servidor lo conoce un instante después de crearlo.
	await students.Dana.page.waitForFunction((id) => !!window.__xpCanvasEditor?.getShape(id), capsuleId)
	let response = await bet('Dana', { outcome: 1, stake: 80, reason: 'El rombo no tiene salida si no hay llave.' })
	assert.equal(response.status(), 409, 'nobody bets on a draft')
	assert.match((await response.json()).error, /sella/)
	await page.evaluate((id) => window.__xpCanvasEditor.updateShape({ id, type: 'capsule', props: { status: 'sealed' } }), capsuleId)
	await wait(300)
	const shape = () => page.evaluate((id) => window.__xpCanvasEditor.getShape(id).props, capsuleId)

	// Apuestas: Dana cambia de A 100 a B 80, Sofi va por A, Mateo por B, Nico pone cero sin porqué.
	assert.equal((await bet('Dana', { outcome: 0, stake: 100, reason: 'Primero pensé que no pasaba nada.' })).status(), 200)
	assert.equal(await students.Dana.points(), 400, 'the stake leaves the balance at once')
	response = await bet('Dana', { outcome: 1, stake: 80, reason: 'El rombo no tiene salida si no hay llave.' })
	assert.equal(response.status(), 200)
	assert.deepEqual((await response.json()).bet, { id: (await response.json()).bet.id, shapeId: capsuleId, revision: 'cap-1', outcome: 1, stake: 80, reason: 'El rombo no tiene salida si no hay llave.' })
	assert.equal(await students.Dana.points(), 420, 'changing the bet refunds the previous stake')
	assert.equal((await bet('Dana', { outcome: 1, stake: 500, reason: 'x' })).status(), 400, 'the shared validator caps the stake at 100')
	assert.equal((await bet('Nico', { outcome: 1, stake: 10, reason: 'x' })).status(), 409, 'no balance, no stake')
	assert.equal((await bet('Sofi', { outcome: 0, stake: 50, reason: 'Si no hay llave, que se regrese a buscarla.' })).status(), 200)
	assert.equal((await bet('Mateo', { outcome: 1, stake: 10, reason: 'Falta ese estado.' })).status(), 200)
	assert.equal((await bet('Nico', { outcome: 1, stake: 0, reason: '' })).status(), 200, 'zero with no reason is still a bet')
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'capsule-bet', shapeId: capsuleId, revision: 'cap-1', outcome: 0, stake: 0, reason: 'x' } })).status(), 403, 'the teacher does not bet')
	await wait(300)
	let props = await shape()
	assert.deepEqual([props.counts, props.stakes], [[1, 3, 0], [50, 90, 0]], 'public totals follow the bets')
	const state = await (await students.Dana.context.request.get(endpoint)).json()
	assert.deepEqual(state.bets.map((b) => [b.shapeId, b.outcome, b.stake]), [[capsuleId, 1, 80]], 'a student sees their own bet when connecting')
	assert.equal((await (await teacher.request.get(endpoint)).json()).bets, undefined, 'the teacher state carries no bets')
	assert.equal((await students.Sofi.context.request.post(endpoint, { data: { action: 'capsule-list', shapeId: capsuleId } })).status(), 403, 'students never list bets')
	const listed = await (await teacher.request.post(endpoint, { data: { action: 'capsule-list', shapeId: capsuleId } })).json()
	assert.deepEqual(listed.bets.map((b) => b.name).sort(), ['Dana', 'Mateo', 'Nico', 'Sofi'])

	// Capturas: lo que ve Leo y lo que ve Dana mientras se apuesta.
	await page.evaluate((id) => { const editor = window.__xpCanvasEditor; editor.select(id); editor.zoomToSelection({ animation: { duration: 0 } }); editor.selectNone() }, capsuleId)
	await wait(600)
	await page.screenshot({ path: `${shots}/leo-sellada.png` })
	await students.Dana.page.evaluate((id) => { const editor = window.__xpCanvasEditor; editor.zoomToBounds(editor.getShapePageBounds(id), { animation: { duration: 0 } }) }, capsuleId)
	await wait(600)
	await students.Dana.page.screenshot({ path: `${shots}/dana-sellada.png` })

	// A la hora de clase nadie puede apostar; Leo sortea y premia.
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'capsule-resolve', shapeId: capsuleId, winner: 5 } })).status(), 400, 'the validator rejects an outcome that cannot exist')
	await page.evaluate((id) => window.__xpCanvasEditor.updateShape({ id, type: 'capsule', props: { opensAt: Date.now() - 1000 } }), capsuleId)
	await wait(300)
	response = await bet('Sofi', { outcome: 1, stake: 10, reason: 'tarde' })
	assert.equal(response.status(), 409)
	assert.match((await response.json()).error, /cerró/)
	assert.equal(await students.Sofi.points(), 450, 'a late bet costs nothing')
	assert.equal((await students.Dana.context.request.post(endpoint, { data: { action: 'capsule-draw', shapeId: capsuleId } })).status(), 403)
	const drawn = []
	for (let i = 0; i < 3; i++) {
		response = await teacher.request.post(endpoint, { data: { action: 'capsule-draw', shapeId: capsuleId } })
		assert.equal(response.status(), 200)
		drawn.push((await response.json()).bet)
	}
	assert.deepEqual(drawn.map((b) => b.name).sort(), ['Dana', 'Mateo', 'Sofi'], 'every bet with a reason is read once; Nico had none')
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'capsule-draw', shapeId: capsuleId } })).status(), 409, 'nothing left to read')
	await wait(300)
	props = await shape()
	assert.equal(props.read, 3)
	assert.equal(props.drawnId, drawn[2].id)
	const first = drawn[0], before = await students[first.name].points()
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'capsule-bonus', shapeId: capsuleId, betId: first.id } })).status(), 200)
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'capsule-bonus', shapeId: capsuleId, betId: first.id } })).status(), 409, 'one bonus per explanation')
	const bonus = Math.max(25, Math.round(first.stake * 1.5))
	for (let i = 0; i < 50 && await students[first.name].points() < before + bonus; i++) await wait(200)
	assert.equal(await students[first.name].points(), before + bonus, `${first.name} is paid ${bonus} for explaining`)
	await wait(1500)
	await page.screenshot({ path: `${shots}/leo-cerrada.png` })
	await students.Dana.page.screenshot({ path: `${shots}/dana-cerrada.png` })

	// Resolver: gana B. Bote 340 entre 90 puntos a B.
	const balances = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await students[name].points()])))
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'capsule-resolve', shapeId: capsuleId, winner: 1 } })).status(), 200)
	assert.equal((await teacher.request.post(endpoint, { data: { action: 'capsule-resolve', shapeId: capsuleId, winner: 0 } })).status(), 409, 'resolved once')
	await wait(300)
	props = await shape()
	assert.equal(props.status, 'resolved')
	assert.equal(props.winner, 1)
	assert.deepEqual(props.payouts, [{ name: 'Dana', stake: 80, paid: 302 }, { name: 'Mateo', stake: 10, paid: 37 }, { name: 'Nico', stake: 0, paid: 0 }])
	for (let i = 0; i < 50 && await students.Dana.points() < balances.Dana + 302; i++) await wait(200)
	assert.equal(await students.Dana.points(), balances.Dana + 302)
	assert.equal(await students.Mateo.points(), balances.Mateo + 37)
	assert.equal(await students.Sofi.points(), balances.Sofi, 'losing keeps the stake gone')
	assert.equal(await students.Nico.points(), balances.Nico)
	assert.equal((await bet('Dana', { outcome: 1, stake: 10, reason: 'x' })).status(), 409, 'no bets after resolving')
	await wait(800)
	await page.screenshot({ path: `${shots}/leo-resuelta.png` })
	await students.Dana.page.screenshot({ path: `${shots}/dana-resuelta.png` })

	// Una copia del canvas empieza con la cápsula sin sellar y sin apuestas.
	const copy = await (await teacher.request.post(`/api/boards/${board.id}/copy`, { data: { name: 'Copia' } })).json()
	const exported = await (await teacher.request.get(`/api/boards/${copy.id}/export`)).json()
	const copied = exported.snapshot.documents.map((d) => d.state).find((record) => record.type === 'capsule')
	assert.deepEqual([copied.props.status, copied.props.counts, copied.props.payouts, copied.props.question], ['draft', [0, 0, 0], [], props.question])
	assert.notEqual(copied.props.revision, 'cap-1')

	assert.deepEqual(errors, [])
	console.log(`capsule smoke passed · capturas en ${shots}`)
} finally {
	await browser.close()
}
