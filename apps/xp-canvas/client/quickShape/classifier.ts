export interface QuickShapePoint {
	x: number
	y: number
}

export type QuickShapeKind = 'line' | 'ellipse' | 'rectangle' | 'triangle'

export interface QuickShapeBounds {
	x: number
	y: number
	w: number
	h: number
}

export type QuickShapeRecognition =
	| {
			kind: 'line'
			confidence: number
			start: QuickShapePoint
			end: QuickShapePoint
	  }
	| {
			kind: Exclude<QuickShapeKind, 'line'>
			confidence: number
			bounds: QuickShapeBounds
			rotation: number
	  }

interface Bounds extends QuickShapeBounds {
	diagonal: number
}

interface PolygonFit {
	corners: QuickShapePoint[]
	error: number
}

interface ClosedCandidate {
	points: QuickShapePoint[]
	confidencePenalty: number
}

const MIN_SHAPE_DIAGONAL_PX = 18
const MAX_CLOSING_GAP_PX = 12
const MAX_CLOSING_GAP_RATIO = 0.35
const MAX_MISSING_FRACTION = 0.14
const CLOSED_SAMPLE_COUNT = 64

/** Recognize a deliberate line, ellipse, rectangle, or triangle from one freehand stroke. */
export function classifyQuickShape(
	input: readonly QuickShapePoint[],
	zoom = 1
): QuickShapeRecognition | null {
	let points = removeDuplicatePoints(input)
	if (points.length < 2) return null
	const screenScale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1

	const bounds = getBounds(points)
	const screenDiagonal = bounds.diagonal * screenScale
	if (screenDiagonal < MIN_SHAPE_DIAGONAL_PX) return null

	const lineSamples = resamplePath(points, 128)

	// Remove tremor in screen pixels before measuring traveled distance. Otherwise
	// a slow, nearly straight Pencil stroke looks like a long backtracking scribble.
	// Keep corners and meaningful hooks; cap work on very dense/coalesced input.
	if (points.length > 2048) points = resamplePath(points, 2048)
	points = ramerDouglasPeucker(points, Math.min(1.5 / screenScale, bounds.diagonal * 0.008))

	const length = getPathLength(points)
	if (length * screenScale < MIN_SHAPE_DIAGONAL_PX) return null

	const line = fitLine(lineSamples, bounds.diagonal, length)
	if (line) return line

	if (length < bounds.diagonal * 2) return null

	const closingDistance = distance(points[0], points[points.length - 1])
	const maxClosingDistance = Math.max(
		MAX_CLOSING_GAP_PX / screenScale,
		bounds.diagonal * MAX_CLOSING_GAP_RATIO
	)
	if (closingDistance > maxClosingDistance) return null

	const candidates: QuickShapeRecognition[] = []
	const openSample = resamplePath(points, Math.min(96, Math.max(24, points.length)))
	if (!hasProperSelfIntersection(openSample)) {
		const robustRectangle = fitRobustRectangle(points, bounds.diagonal)
		if (robustRectangle) candidates.push(robustRectangle)
	}

	for (const closedCandidate of getClosedCandidates(
		points,
		bounds.diagonal,
		length,
		screenScale
	)) {
		const ring = resampleClosedPath(closedCandidate.points, CLOSED_SAMPLE_COUNT)
		if (ring.length < 12 || hasProperSelfIntersection([...ring, ring[0]])) continue

		const polygonFit = simplifyClosedPath(ring, bounds.diagonal * 0.045)
		const rectangle = polygonFit && fitRectangle(polygonFit, bounds.diagonal)
		const triangle = polygonFit && fitTriangle(polygonFit, bounds.diagonal)
		const ellipse = fitEllipse(ring, bounds.diagonal)
		for (const recognition of [rectangle, triangle, ellipse]) {
			if (!recognition) continue
			const confidence = recognition.confidence - closedCandidate.confidencePenalty
			if (confidence >= 0.62) candidates.push({ ...recognition, confidence })
		}
	}

	if (candidates.length === 0) return null

	return candidates.sort((a, b) => b.confidence - a.confidence)[0]
}

function fitLine(
	points: readonly QuickShapePoint[],
	diagonal: number,
	pathLength: number
): QuickShapeRecognition | null {
	const center = {
		x: average(points.map((point) => point.x)),
		y: average(points.map((point) => point.y)),
	}
	let axis = getPrincipalAxis(points, center)
	if (dot(subtract(points[points.length - 1], points[0]), axis) < 0) axis = multiply(axis, -1)

	let squaredError = 0
	let minProjection = Number.POSITIVE_INFINITY
	let maxProjection = Number.NEGATIVE_INFINITY
	for (const point of points) {
		const offset = subtract(point, center)
		const projection = dot(offset, axis)
		const perpendicular = cross(offset, axis)
		minProjection = Math.min(minProjection, projection)
		maxProjection = Math.max(maxProjection, projection)
		squaredError += perpendicular * perpendicular
	}

	const normalizedError = Math.sqrt(squaredError / points.length) / diagonal
	if (normalizedError > 0.055) return null
	const projectedSpan = maxProjection - minProjection
	if (projectedSpan / pathLength < 0.82) return null
	const startProjection = dot(subtract(points[0], center), axis)
	const endProjection = dot(subtract(points[points.length - 1], center), axis)
	const netProgress = Math.abs(endProjection - startProjection) / projectedSpan
	if (netProgress < 0.72) return null

	return {
		kind: 'line',
		confidence:
			clamp01(1 - normalizedError / 0.055) * 0.45 +
			clamp01(projectedSpan / pathLength) * 0.35 +
			clamp01(netProgress) * 0.2,
		start: add(center, multiply(axis, minProjection)),
		end: add(center, multiply(axis, maxProjection)),
	}
}

function fitRectangle(fit: PolygonFit, diagonal: number): QuickShapeRecognition | null {
	if (fit.corners.length !== 4 || fit.error > 0.07) return null

	const edges = fit.corners.map((point, index) =>
		subtract(fit.corners[(index + 1) % fit.corners.length], point)
	)
	const edgeLengths = edges.map(magnitude)
	if (Math.min(...edgeLengths) < diagonal * 0.14) return null

	const rightAngleErrors = edges.map((edge, index) => {
		const next = edges[(index + 1) % edges.length]
		return Math.abs(dot(edge, next) / (magnitude(edge) * magnitude(next)))
	})
	const rightAngleError = average(rightAngleErrors)
	if (Math.max(...rightAngleErrors) > 0.42 || rightAngleError > 0.28) return null

	const parallelError =
		(Math.abs(cross(edges[0], edges[2]) / (edgeLengths[0] * edgeLengths[2])) +
			Math.abs(cross(edges[1], edges[3]) / (edgeLengths[1] * edgeLengths[3]))) /
		2
	if (parallelError > 0.3) return null

	const firstAxis = normalize(add(normalizeOrZero(edges[0]), multiply(normalizeOrZero(edges[2]), -1)))
	if (!firstAxis) return null
	const secondAxis = { x: -firstAxis.y, y: firstAxis.x }
	// Bounds come from the repaired polygon corners. Using every raw point makes
	// a small hook or overshoot permanently enlarge and rotate the clean result.
	const oriented = getOrientedBounds(fit.corners, firstAxis, secondAxis)
	if (oriented.w < 1 || oriented.h < 1) return null

	const confidence = clamp01(
		1 - fit.error * 5.5 - rightAngleError * 0.65 - parallelError * 0.45
	)
	if (confidence < 0.62) return null

	return {
		kind: 'rectangle',
		confidence,
		bounds: oriented,
		rotation: Math.atan2(firstAxis.y, firstAxis.x),
	}
}

/**
 * Fit an orthogonal four-sided stroke without trusting its extreme points.
 * This catches small open seams, hooks and overshoots while still requiring
 * evidence for all four sides.
 */
function fitRobustRectangle(
	points: readonly QuickShapePoint[],
	diagonal: number
): QuickShapeRecognition | null {
	const segments: Array<{
		delta: QuickShapePoint
		midpoint: QuickShapePoint
		length: number
	}> = []
	let totalLength = 0
	let directionX = 0
	let directionY = 0

	for (let index = 1; index < points.length; index++) {
		const delta = subtract(points[index], points[index - 1])
		const segmentLength = magnitude(delta)
		if (segmentLength < 0.001) continue
		const angle = Math.atan2(delta.y, delta.x)
		directionX += Math.cos(angle * 4) * segmentLength
		directionY += Math.sin(angle * 4) * segmentLength
		totalLength += segmentLength
		segments.push({
			delta,
			midpoint: lerp(points[index - 1], points[index], 0.5),
			length: segmentLength,
		})
	}
	if (segments.length < 4 || totalLength === 0) return null

	const directionStrength = Math.hypot(directionX, directionY) / totalLength
	if (directionStrength < 0.55) return null

	const angle = Math.atan2(directionY, directionX) / 4
	const xAxis = { x: Math.cos(angle), y: Math.sin(angle) }
	const yAxis = { x: -xAxis.y, y: xAxis.x }
	let weightedAlignment = 0
	const projectedX: Array<{ value: number; weight: number }> = []
	const projectedY: Array<{ value: number; weight: number }> = []

	for (const segment of segments) {
		const unit = multiply(segment.delta, 1 / segment.length)
		weightedAlignment +=
			Math.max(Math.abs(dot(unit, xAxis)), Math.abs(dot(unit, yAxis))) * segment.length
		projectedX.push({ value: dot(segment.midpoint, xAxis), weight: segment.length })
		projectedY.push({ value: dot(segment.midpoint, yAxis), weight: segment.length })
	}
	const alignment = weightedAlignment / totalLength
	if (alignment < 0.82) return null

	const minX = weightedQuantile(projectedX, 0.08)
	const maxX = weightedQuantile(projectedX, 0.92)
	const minY = weightedQuantile(projectedY, 0.08)
	const maxY = weightedQuantile(projectedY, 0.92)
	const width = maxX - minX
	const height = maxY - minY
	if (width < diagonal * 0.14 || height < diagonal * 0.14) return null

	const sideCoverage = [0, 0, 0, 0]
	const xTolerance = Math.max(diagonal * 0.025, width * 0.08)
	const yTolerance = Math.max(diagonal * 0.025, height * 0.08)
	for (const segment of segments) {
		const unit = multiply(segment.delta, 1 / segment.length)
		const alongX = Math.abs(dot(unit, xAxis))
		const alongY = Math.abs(dot(unit, yAxis))
		const midpointX = dot(segment.midpoint, xAxis)
		const midpointY = dot(segment.midpoint, yAxis)
		if (alongX >= alongY && alongX >= 0.75) {
			const contribution = alongX * segment.length
			if (Math.abs(midpointY - minY) <= yTolerance) sideCoverage[0] += contribution
			if (Math.abs(midpointY - maxY) <= yTolerance) sideCoverage[1] += contribution
		} else if (alongY > alongX && alongY >= 0.75) {
			const contribution = alongY * segment.length
			if (Math.abs(midpointX - minX) <= xTolerance) sideCoverage[2] += contribution
			if (Math.abs(midpointX - maxX) <= xTolerance) sideCoverage[3] += contribution
		}
	}

	const coverage = Math.min(
		sideCoverage[0] / width,
		sideCoverage[1] / width,
		sideCoverage[2] / height,
		sideCoverage[3] / height
	)
	if (coverage < 0.32) return null

	const confidence = clamp01(
		directionStrength * 0.45 + alignment * 0.35 + clamp01(coverage) * 0.2
	)
	if (confidence < 0.62) return null

	const origin = add(multiply(xAxis, minX), multiply(yAxis, minY))
	return {
		kind: 'rectangle',
		confidence,
		bounds: { x: origin.x, y: origin.y, w: width, h: height },
		rotation: angle,
	}
}

function weightedQuantile(
	input: readonly { value: number; weight: number }[],
	quantile: number
) {
	const values = [...input].sort((a, b) => a.value - b.value)
	const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
	const target = totalWeight * quantile
	let cumulative = 0
	for (const item of values) {
		cumulative += item.weight
		if (cumulative >= target) return item.value
	}
	return values[values.length - 1]?.value ?? 0
}

function fitTriangle(fit: PolygonFit, diagonal: number): QuickShapeRecognition | null {
	if (fit.corners.length !== 3 || fit.error > 0.075) return null

	const corners = fit.corners
	const edges = corners.map((point, index) => subtract(corners[(index + 1) % 3], point))
	const lengths = edges.map(magnitude)
	if (Math.min(...lengths) < diagonal * 0.2) return null

	const area = Math.abs(cross(subtract(corners[1], corners[0]), subtract(corners[2], corners[0]))) / 2
	if (area < diagonal * diagonal * 0.12) return null

	let baseIndex = 0
	if (lengths[1] > lengths[baseIndex]) baseIndex = 1
	if (lengths[2] > lengths[baseIndex]) baseIndex = 2

	const baseStart = corners[baseIndex]
	const baseEnd = corners[(baseIndex + 1) % 3]
	const apex = corners[(baseIndex + 2) % 3]
	const baseMidpoint = multiply(add(baseStart, baseEnd), 0.5)
	const yAxis = normalize(subtract(baseMidpoint, apex))
	if (!yAxis) return null
	let xAxis = { x: yAxis.y, y: -yAxis.x }
	if (dot(subtract(baseEnd, baseStart), xAxis) < 0) xAxis = multiply(xAxis, -1)

	const baseWidth = Math.abs(dot(subtract(baseEnd, baseStart), xAxis))
	const height = Math.abs(dot(subtract(baseMidpoint, apex), yAxis))
	if (baseWidth < 1 || height < 1) return null

	const origin = add(apex, multiply(xAxis, -baseWidth / 2))
	const confidence = clamp01(1 - fit.error * 5.5)
	if (confidence < 0.62) return null

	return {
		kind: 'triangle',
		confidence,
		bounds: { x: origin.x, y: origin.y, w: baseWidth, h: height },
		rotation: Math.atan2(xAxis.y, xAxis.x),
	}
}

function fitEllipse(
	points: readonly QuickShapePoint[],
	diagonal: number
): QuickShapeRecognition | null {
	const center = {
		x: average(points.map((point) => point.x)),
		y: average(points.map((point) => point.y)),
	}
	const axis = getPrincipalAxis(points, center)
	const perpendicular = { x: -axis.y, y: axis.x }
	const oriented = getOrientedBounds(points, axis, perpendicular)
	const radiusX = oriented.w / 2
	const radiusY = oriented.h / 2
	if (Math.min(radiusX, radiusY) < diagonal * 0.09) return null

	const fittedCenter = add(
		{ x: oriented.x, y: oriented.y },
		add(multiply(axis, radiusX), multiply(perpendicular, radiusY))
	)
	let squaredRadialError = 0
	let winding = 0
	let previousAngle: number | null = null
	for (const point of points) {
		const offset = subtract(point, fittedCenter)
		const localX = dot(offset, axis) / radiusX
		const localY = dot(offset, perpendicular) / radiusY
		const radius = Math.hypot(localX, localY)
		squaredRadialError += (radius - 1) ** 2

		const angle = Math.atan2(localY, localX)
		if (previousAngle !== null) winding += normalizeAngle(angle - previousAngle)
		previousAngle = angle
	}

	const radialError = Math.sqrt(squaredRadialError / points.length)
	if (radialError > 0.15 || Math.abs(winding) < Math.PI * 1.45) return null

	const confidence = clamp01(1 - radialError / 0.2)
	if (confidence < 0.62) return null

	const origin = add(
		fittedCenter,
		add(multiply(axis, -radiusX), multiply(perpendicular, -radiusY))
	)
	return {
		kind: 'ellipse',
		confidence,
		bounds: { x: origin.x, y: origin.y, w: radiusX * 2, h: radiusY * 2 },
		rotation: Math.atan2(axis.y, axis.x),
	}
}

function getClosedCandidates(
	points: readonly QuickShapePoint[],
	diagonal: number,
	pathLength: number,
	screenScale: number
): ClosedCandidate[] {
	const candidates: ClosedCandidate[] = []
	const directDistance = distance(points[0], points[points.length - 1])
	const directFraction = directDistance / (pathLength + directDistance)
	if (directFraction <= MAX_MISSING_FRACTION) {
		candidates.push({
			points: [...points],
			confidencePenalty: directFraction * 0.45,
		})
	}

	const inferredCorner = inferMissingCorner(points, diagonal, pathLength, screenScale)
	if (inferredCorner) candidates.push(inferredCorner)

	const trimmed = trimSeamTails(points, diagonal, pathLength, screenScale)
	if (trimmed) candidates.push(trimmed)

	return candidates
}

function inferMissingCorner(
	points: readonly QuickShapePoint[],
	diagonal: number,
	pathLength: number,
	screenScale: number
): ClosedCandidate | null {
	const tangentLength = Math.max(8 / screenScale, diagonal * 0.06)
	const startTangent = getEndpointTangent(points, true, tangentLength)
	const endTangent = getEndpointTangent(points, false, tangentLength)
	if (!startTangent || !endTangent) return null

	const maxTangentError = Math.max(3 / screenScale, diagonal * 0.025)
	if (startTangent.error > maxTangentError || endTangent.error > maxTangentError) return null
	if (Math.abs(dot(startTangent.direction, endTangent.direction)) > Math.cos((35 * Math.PI) / 180)) {
		return null
	}

	const start = points[0]
	const end = points[points.length - 1]
	const denominator = cross(startTangent.direction, endTangent.direction)
	if (Math.abs(denominator) < 0.001) return null
	const between = subtract(end, start)
	const startAmount = cross(between, endTangent.direction) / denominator
	const endAmount = cross(between, startTangent.direction) / denominator
	const directionalTolerance = Math.max(3 / screenScale, diagonal * 0.02)
	if (startAmount > directionalTolerance || endAmount < -directionalTolerance) return null

	const corner = add(start, multiply(startTangent.direction, startAmount))
	const addedLength = distance(end, corner) + distance(corner, start)
	const missingFraction = addedLength / (pathLength + addedLength)
	if (addedLength > diagonal * MAX_CLOSING_GAP_RATIO || missingFraction > MAX_MISSING_FRACTION) {
		return null
	}

	return {
		points: [...points, corner],
		confidencePenalty: missingFraction * 0.45,
	}
}

function getEndpointTangent(
	points: readonly QuickShapePoint[],
	fromStart: boolean,
	targetLength: number
): { direction: QuickShapePoint; error: number } | null {
	const anchorIndex = fromStart ? 0 : points.length - 1
	const directionStep = fromStart ? 1 : -1
	const anchor = points[anchorIndex]
	const samples = [anchor]
	let traveled = 0
	let previous = anchor
	let index = anchorIndex + directionStep

	while (index >= 0 && index < points.length && traveled < targetLength) {
		const point = points[index]
		const segmentLength = distance(previous, point)
		if (traveled + segmentLength >= targetLength && segmentLength > 0) {
			const amount = (targetLength - traveled) / segmentLength
			samples.push(lerp(previous, point, amount))
			traveled = targetLength
			break
		}
		samples.push(point)
		traveled += segmentLength
		previous = point
		index += directionStep
	}
	if (samples.length < 2 || traveled < targetLength * 0.55) return null

	const awayFromAnchor = normalize(subtract(samples[samples.length - 1], anchor))
	if (!awayFromAnchor) return null
	const direction = fromStart ? awayFromAnchor : multiply(awayFromAnchor, -1)
	const squaredError = samples.reduce((sum, point) => {
		const offset = subtract(point, anchor)
		const perpendicular = cross(offset, direction)
		return sum + perpendicular * perpendicular
	}, 0)

	return { direction, error: Math.sqrt(squaredError / samples.length) }
}

function trimSeamTails(
	points: readonly QuickShapePoint[],
	diagonal: number,
	pathLength: number,
	screenScale: number
): ClosedCandidate | null {
	const cumulative = [0]
	for (let index = 1; index < points.length; index++) {
		cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]))
	}

	const seamRadius = Math.max(8 / screenScale, diagonal * 0.035)
	let best: { start: number; end: number; gap: number; removed: number } | null = null
	for (let start = 0; start < points.length - 3 && cumulative[start] <= pathLength * 0.18; start++) {
		for (
			let end = points.length - 1;
			end > start + 2 && cumulative[end] >= pathLength * 0.82;
			end--
		) {
			const gap = distance(points[start], points[end])
			if (gap > seamRadius) continue
			const removed = cumulative[start] + pathLength - cumulative[end]
			const coreLength = cumulative[end] - cumulative[start]
			if (removed < 1 / screenScale || removed > pathLength * 0.18 || coreLength < diagonal * 2) {
				continue
			}
			if (!best || gap < best.gap || (gap === best.gap && removed < best.removed)) {
				best = { start, end, gap, removed }
			}
		}
	}
	if (!best) return null

	return {
		points: points.slice(best.start, best.end + 1),
		confidencePenalty: (best.removed / pathLength) * 0.25,
	}
}

function simplifyClosedPath(points: readonly QuickShapePoint[], tolerance: number): PolygonFit | null {
	let splitA = 0
	let splitB = 1
	let largestDistance = 0
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			const candidateDistance = squaredDistance(points[i], points[j])
			if (candidateDistance > largestDistance) {
				largestDistance = candidateDistance
				splitA = i
				splitB = j
			}
		}
	}

	const firstArc = circularSlice(points, splitA, splitB)
	const secondArc = circularSlice(points, splitB, splitA)
	let corners = [
		...ramerDouglasPeucker(firstArc, tolerance).slice(0, -1),
		...ramerDouglasPeucker(secondArc, tolerance).slice(0, -1),
	]
	corners = removeShallowCorners(corners)
	if (corners.length < 3 || corners.length > 8) return null

	const error = average(
		points.map((point) =>
			Math.min(
				...corners.map((corner, index) =>
					distanceToSegment(point, corner, corners[(index + 1) % corners.length])
				)
			)
		)
	) / Math.sqrt(largestDistance)

	return { corners, error }
}

function removeShallowCorners(input: readonly QuickShapePoint[]) {
	let corners = [...input]
	let changed = true
	while (changed && corners.length > 3) {
		changed = false
		for (let index = 0; index < corners.length; index++) {
			const previous = corners[(index - 1 + corners.length) % corners.length]
			const current = corners[index]
			const next = corners[(index + 1) % corners.length]
			const incoming = normalize(subtract(current, previous))
			const outgoing = normalize(subtract(next, current))
			if (!incoming || !outgoing || Math.abs(cross(incoming, outgoing)) < 0.25) {
				corners.splice(index, 1)
				changed = true
				break
			}
		}
	}
	return corners
}

function ramerDouglasPeucker(
	points: readonly QuickShapePoint[],
	tolerance: number
): QuickShapePoint[] {
	if (points.length <= 2) return [...points]

	let maxDistance = 0
	let splitIndex = 0
	for (let index = 1; index < points.length - 1; index++) {
		const candidateDistance = distanceToSegment(points[index], points[0], points[points.length - 1])
		if (candidateDistance > maxDistance) {
			maxDistance = candidateDistance
			splitIndex = index
		}
	}

	if (maxDistance <= tolerance) return [points[0], points[points.length - 1]]

	const first = ramerDouglasPeucker(points.slice(0, splitIndex + 1), tolerance)
	const second = ramerDouglasPeucker(points.slice(splitIndex), tolerance)
	return [...first.slice(0, -1), ...second]
}

function resamplePath(points: readonly QuickShapePoint[], count: number) {
	if (points.length < 2 || count < 2) return [...points]
	const segmentLengths = points.slice(1).map((point, index) => distance(points[index], point))
	const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0)
	if (totalLength === 0) return []

	const result: QuickShapePoint[] = []
	let segmentIndex = 0
	let distanceBeforeSegment = 0
	for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
		const targetDistance = (sampleIndex / (count - 1)) * totalLength
		while (
			segmentIndex < segmentLengths.length - 1 &&
			distanceBeforeSegment + segmentLengths[segmentIndex] < targetDistance
		) {
			distanceBeforeSegment += segmentLengths[segmentIndex]
			segmentIndex++
		}
		const segmentLength = segmentLengths[segmentIndex]
		const progress = segmentLength === 0 ? 0 : (targetDistance - distanceBeforeSegment) / segmentLength
		result.push(lerp(points[segmentIndex], points[segmentIndex + 1], progress))
	}
	return result
}

function resampleClosedPath(points: readonly QuickShapePoint[], count: number) {
	const closed = [...points]
	if (distance(closed[0], closed[closed.length - 1]) > 0.001) closed.push(closed[0])
	const segmentLengths = closed.slice(1).map((point, index) => distance(closed[index], point))
	const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0)
	if (totalLength === 0) return []

	const result: QuickShapePoint[] = []
	let segmentIndex = 0
	let distanceBeforeSegment = 0
	for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
		const targetDistance = (sampleIndex / count) * totalLength
		while (
			segmentIndex < segmentLengths.length - 1 &&
			distanceBeforeSegment + segmentLengths[segmentIndex] < targetDistance
		) {
			distanceBeforeSegment += segmentLengths[segmentIndex]
			segmentIndex++
		}
		const segmentLength = segmentLengths[segmentIndex]
		const progress = segmentLength === 0 ? 0 : (targetDistance - distanceBeforeSegment) / segmentLength
		result.push(lerp(closed[segmentIndex], closed[segmentIndex + 1], progress))
	}
	return result
}

function hasProperSelfIntersection(points: readonly QuickShapePoint[]) {
	if (points.length < 4) return false
	const lastSegment = points.length - 2
	const isClosed = squaredDistance(points[0], points[points.length - 1]) < 0.01
	const segmentCount = lastSegment + 1
	const localHookLimit = Math.max(2, Math.ceil(segmentCount * 0.08))
	for (let first = 0; first <= lastSegment; first++) {
		for (let second = first + 2; second <= lastSegment; second++) {
			if (isClosed && first === 0 && second === lastSegment) continue
			const separation = second - first
			const circularSeparation = isClosed
				? Math.min(separation, segmentCount - separation)
				: separation
			// A short out-and-back hook is precisely one of the recoverable cases.
			// Crossings far apart along the stroke remain a strong bow-tie/scribble signal.
			if (circularSeparation <= localHookLimit) continue
			if (
				segmentsProperlyIntersect(
					points[first],
					points[first + 1],
					points[second],
					points[second + 1]
				)
			) {
				return true
			}
		}
	}
	return false
}

function segmentsProperlyIntersect(
	firstStart: QuickShapePoint,
	firstEnd: QuickShapePoint,
	secondStart: QuickShapePoint,
	secondEnd: QuickShapePoint
) {
	const firstDirection = subtract(firstEnd, firstStart)
	const secondDirection = subtract(secondEnd, secondStart)
	const firstA = cross(firstDirection, subtract(secondStart, firstStart))
	const firstB = cross(firstDirection, subtract(secondEnd, firstStart))
	const secondA = cross(secondDirection, subtract(firstStart, secondStart))
	const secondB = cross(secondDirection, subtract(firstEnd, secondStart))
	const epsilon = 0.000001
	return firstA * firstB < -epsilon && secondA * secondB < -epsilon
}

function circularSlice(points: readonly QuickShapePoint[], start: number, end: number) {
	const result = [points[start]]
	let index = start
	while (index !== end) {
		index = (index + 1) % points.length
		result.push(points[index])
	}
	return result
}

function getPrincipalAxis(points: readonly QuickShapePoint[], center: QuickShapePoint) {
	let xx = 0
	let xy = 0
	let yy = 0
	for (const point of points) {
		const x = point.x - center.x
		const y = point.y - center.y
		xx += x * x
		xy += x * y
		yy += y * y
	}
	const angle = 0.5 * Math.atan2(2 * xy, xx - yy)
	return { x: Math.cos(angle), y: Math.sin(angle) }
}

function getOrientedBounds(
	points: readonly QuickShapePoint[],
	xAxis: QuickShapePoint,
	yAxis: QuickShapePoint
): QuickShapeBounds {
	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	for (const point of points) {
		const x = dot(point, xAxis)
		const y = dot(point, yAxis)
		minX = Math.min(minX, x)
		minY = Math.min(minY, y)
		maxX = Math.max(maxX, x)
		maxY = Math.max(maxY, y)
	}
	const origin = add(multiply(xAxis, minX), multiply(yAxis, minY))
	return { x: origin.x, y: origin.y, w: maxX - minX, h: maxY - minY }
}

function getBounds(points: readonly QuickShapePoint[]): Bounds {
	let minX = Number.POSITIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	for (const point of points) {
		minX = Math.min(minX, point.x)
		minY = Math.min(minY, point.y)
		maxX = Math.max(maxX, point.x)
		maxY = Math.max(maxY, point.y)
	}
	const w = maxX - minX
	const h = maxY - minY
	return { x: minX, y: minY, w, h, diagonal: Math.hypot(w, h) }
}

function removeDuplicatePoints(points: readonly QuickShapePoint[]) {
	const result: QuickShapePoint[] = []
	for (const point of points) {
		if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
		if (result.length === 0 || squaredDistance(result[result.length - 1], point) > 0.01) {
			result.push({ x: point.x, y: point.y })
		}
	}
	return result
}

function getPathLength(points: readonly QuickShapePoint[]) {
	let result = 0
	for (let index = 1; index < points.length; index++) result += distance(points[index - 1], points[index])
	return result
}

function distanceToSegment(point: QuickShapePoint, start: QuickShapePoint, end: QuickShapePoint) {
	const segment = subtract(end, start)
	const lengthSquared = dot(segment, segment)
	if (lengthSquared === 0) return distance(point, start)
	const t = clamp01(dot(subtract(point, start), segment) / lengthSquared)
	return distance(point, add(start, multiply(segment, t)))
}

function normalizeAngle(angle: number) {
	while (angle > Math.PI) angle -= Math.PI * 2
	while (angle < -Math.PI) angle += Math.PI * 2
	return angle
}

function normalize(point: QuickShapePoint): QuickShapePoint | null {
	const length = magnitude(point)
	return length < 0.0001 ? null : multiply(point, 1 / length)
}

function normalizeOrZero(point: QuickShapePoint) {
	return normalize(point) ?? { x: 0, y: 0 }
}

function magnitude(point: QuickShapePoint) {
	return Math.hypot(point.x, point.y)
}

function squaredDistance(first: QuickShapePoint, second: QuickShapePoint) {
	const x = first.x - second.x
	const y = first.y - second.y
	return x * x + y * y
}

function distance(first: QuickShapePoint, second: QuickShapePoint) {
	return Math.sqrt(squaredDistance(first, second))
}

function dot(first: QuickShapePoint, second: QuickShapePoint) {
	return first.x * second.x + first.y * second.y
}

function cross(first: QuickShapePoint, second: QuickShapePoint) {
	return first.x * second.y - first.y * second.x
}

function add(first: QuickShapePoint, second: QuickShapePoint): QuickShapePoint {
	return { x: first.x + second.x, y: first.y + second.y }
}

function subtract(first: QuickShapePoint, second: QuickShapePoint): QuickShapePoint {
	return { x: first.x - second.x, y: first.y - second.y }
}

function multiply(point: QuickShapePoint, amount: number): QuickShapePoint {
	return { x: point.x * amount, y: point.y * amount }
}

function lerp(first: QuickShapePoint, second: QuickShapePoint, amount: number): QuickShapePoint {
	return add(first, multiply(subtract(second, first), amount))
}

function average(values: readonly number[]) {
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp01(value: number) {
	return Math.max(0, Math.min(1, value))
}
