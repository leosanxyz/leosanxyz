import { VS } from './shaders'

export type UniformValue = number | Float32Array | readonly number[]
export type Uniforms = Record<string, UniformValue>
export interface Program {
	program: WebGLProgram
	uniforms: Record<string, WebGLUniformLocation>
}

function compile(gl: WebGL2RenderingContext, fs: string): Program {
	const program = gl.createProgram()!
	for (const [type, source] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]] as const) {
		const shader = gl.createShader(type)!
		gl.shaderSource(shader, source)
		gl.compileShader(shader)
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
		gl.attachShader(program, shader)
	}
	gl.linkProgram(program)
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link')
	const uniforms: Program['uniforms'] = {}
	const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
	for (let i = 0; i < count; i++) {
		const name = gl.getActiveUniform(program, i)!.name.replace('[0]', '')
		uniforms[name] = gl.getUniformLocation(program, name)!
	}
	return { program, uniforms }
}

export function setUniforms(gl: WebGL2RenderingContext, program: Program, values: Uniforms) {
	for (const key in values) {
		const location = program.uniforms[key]
		if (!location) continue
		const v = values[key]
		if (typeof v === 'number') gl.uniform1f(location, v)
		else if (v instanceof Float32Array) gl.uniform4fv(location, v) // particle arrays: one vec4 each
		else if (v.length === 2) gl.uniform2f(location, v[0], v[1])
		else gl.uniform3f(location, v[0], v[1], v[2])
	}
}

function texture(gl: WebGL2RenderingContext, source: TexImageSource, unit: number) {
	gl.activeTexture(gl.TEXTURE0 + unit)
	gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

/** One material program with its three textures (art, mask, relief) and a full-screen triangle, ready to draw. */
export function buildProgram(gl: WebGL2RenderingContext, fs: string, textures: { art: TexImageSource; mask: TexImageSource; aux: TexImageSource }) {
	const program = compile(gl, fs)
	gl.bindVertexArray(gl.createVertexArray())
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
	gl.enableVertexAttribArray(0)
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
	texture(gl, textures.art, 0)
	texture(gl, textures.mask, 1)
	texture(gl, textures.aux, 2)
	gl.useProgram(program.program)
	gl.uniform1i(program.uniforms.uImg, 0)
	gl.uniform1i(program.uniforms.uMask, 1)
	if (program.uniforms.uAux) gl.uniform1i(program.uniforms.uAux, 2)
	return program
}

export function draw(gl: WebGL2RenderingContext, program: Program, values: Uniforms) {
	gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
	gl.clearColor(0, 0, 0, 0)
	gl.clear(gl.COLOR_BUFFER_BIT)
	setUniforms(gl, program, values)
	gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export const release = (gl: WebGL2RenderingContext) => gl.getExtension('WEBGL_lose_context')?.loseContext()
