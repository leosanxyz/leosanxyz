import xp from '../../../design/pass-skins/xp-logo.png'
import longDark from '../../../design/pass-skins/the-long-dark-cabin.jpg'
import slime from '../../../design/pass-skins/slime-rancher-aurora.png'
import halo from '../../../design/pass-skins/halo-infinite-key-art.jpg'
import valorant from '../../../design/pass-skins/valorant-agents.png'
import destiny from '../../../design/pass-skins/destiny-traveler.png'
import fortnite from '../../../design/pass-skins/fortnite.jpg'
import ucn from '../../../design/pass-skins/ultimate-custom-night.jpg'
import rivals from '../../../design/pass-skins/marvel-rivals-team.png'
import deltarune from '../../../design/pass-skins/deltarune.jpg'
import minecraft from '../../../design/pass-skins/minecraft.jpg'
import rocketLeague from '../../../design/pass-skins/rocket-league.jpg'
import tetris from '../../../design/pass-skins/tetris.jpg'
import terraria from '../../../design/pass-skins/terraria.jpg'
import smash from '../../../design/pass-skins/smash-key-art.jpg'
import doom from '../../../design/pass-skins/doom.jpg'
import roblox from '../../../design/pass-skins/roblox-poster.jpg'
import hades from '../../../design/pass-skins/hades.jpg'
import factorio from '../../../design/pass-skins/factorio.jpg'
import baldursGate from '../../../design/pass-skins/baldurs-gate.jpg'
import eldenRing from '../../../design/pass-skins/elden-ring.jpg'
import helldivers from '../../../design/pass-skins/helldivers.jpg'
import kingdomHearts from '../../../design/pass-skins/kingdom-hearts.jpg'
import darkSouls from '../../../design/pass-skins/dark-souls.jpg'
import cultOfTheLamb from '../../../design/pass-skins/cult-of-the-lamb.jpg'
import { STICKERS, type PassSkin, type StickerId } from '../../../shared/pass'

export const skins: {
	id: PassSkin
	name: string
	edition: string
	image: string
	color: string
}[] = [
	{
		id: 'xp',
		name: 'Original XP',
		edition: 'Una página en blanco',
		image: xp,
		color: '#d6ff45',
	},
	{
		id: 'long-dark',
		name: 'The Long Dark',
		edition: 'Bajo la aurora',
		image: longDark,
		color: '#a1e4c8',
	},
	{
		id: 'slime',
		name: 'Slime Rancher',
		edition: 'Un pequeño mundo',
		image: slime,
		color: '#ffc4db',
	},
	{
		id: 'halo',
		name: 'Halo',
		edition: 'Infinite · Campaña',
		image: halo,
		color: '#bce0f9',
	},
	{
		id: 'valorant',
		name: 'Valorant',
		edition: 'Agentes',
		image: valorant,
		color: '#c2a6ff',
	},
	{
		id: 'destiny',
		name: 'Destiny 2',
		edition: 'Un nuevo destino',
		image: destiny,
		color: '#f6d79c',
	},
	{
		id: 'fortnite',
		name: 'Fortnite',
		edition: 'Battle Royale',
		image: fortnite,
		color: '#8ed5ef',
	},
	{
		id: 'ucn',
		name: 'Ultimate Custom Night',
		edition: 'Una noche más',
		image: ucn,
		color: '#bbaa9e',
	},
	{
		id: 'rivals',
		name: 'Marvel Rivals',
		edition: 'En equipo',
		image: rivals,
		color: '#f197bd',
	},
	{
		id: 'deltarune',
		name: 'Deltarune',
		edition: 'En la oscuridad',
		image: deltarune,
		color: '#82e3ff',
	},
	{ id: 'minecraft', name: 'Minecraft', edition: 'Un mundo por construir', image: minecraft, color: '#a0df85' },
	{ id: 'rocket-league', name: 'Rocket League', edition: 'A toda velocidad', image: rocketLeague, color: '#91dbff' },
	{ id: 'tetris', name: 'Tetris', edition: 'Effect: Connected', image: tetris, color: '#a4f0f7' },
	{ id: 'terraria', name: 'Terraria', edition: 'Más allá de la superficie', image: terraria, color: '#b4ea89' },
	{ id: 'smash', name: 'Super Smash Bros.', edition: 'Ultimate', image: smash, color: '#f5cb76' },
	{ id: 'doom', name: 'DOOM', edition: 'DOOM + DOOM II', image: doom, color: '#fba66c' },
	{ id: 'roblox', name: 'Roblox', edition: 'Imagina y crea', image: roblox, color: '#a9caff' },
	{ id: 'hades', name: 'Hades', edition: 'Una salida del inframundo', image: hades, color: '#ff9a88' },
	{ id: 'factorio', name: 'Factorio', edition: 'Una pieza a la vez', image: factorio, color: '#eabb76' },
	{ id: 'baldurs-gate', name: "Baldur's Gate", edition: 'Baldur\'s Gate 3', image: baldursGate, color: '#dcc392' },
	{ id: 'elden-ring', name: 'Elden Ring', edition: 'Las Tierras Intermedias', image: eldenRing, color: '#e6ce8a' },
	{ id: 'helldivers', name: 'Helldivers', edition: 'Helldivers 2', image: helldivers, color: '#f0df80' },
	{ id: 'kingdom-hearts', name: 'Kingdom Hearts', edition: 'HD 1.5 + 2.5 ReMIX', image: kingdomHearts, color: '#b0c9f4' },
	{ id: 'dark-souls', name: 'Dark Souls', edition: 'Remastered', image: darkSouls, color: '#e9b476' },
	{ id: 'cult-of-the-lamb', name: 'Cult of the Lamb', edition: 'Unholy Alliance', image: cultOfTheLamb, color: '#eeb0cc' },
]
export const stickerArt: Record<StickerId, { glyph: string; name: string }> = {
	spark: { glyph: '✦', name: 'Destello' },
	heart: { glyph: '💛', name: 'Corazón' },
	star: { glyph: '⭐', name: 'Estrella' },
	moon: { glyph: '🌙', name: 'Luna' },
	planet: { glyph: '🪐', name: 'Planeta' },
	flower: { glyph: '🌼', name: 'Flor' },
	ghost: { glyph: '👻', name: 'Fantasma' },
	frog: { glyph: '🐸', name: 'Rana' },
	mushroom: { glyph: '🍄', name: 'Hongo' },
	controller: { glyph: '🎮', name: 'Control' },
	pencil: { glyph: '✏️', name: 'Lápiz' },
	code: { glyph: '</>', name: 'Código' },
}
const pack = (...first: StickerId[]): StickerId[] => [...first, ...STICKERS.filter((id) => !first.includes(id))]
export const packs: Record<PassSkin, StickerId[]> = {
	minecraft: pack('pencil', 'frog', 'mushroom'),
	'rocket-league': pack('controller', 'star', 'spark'),
	tetris: pack('code', 'spark', 'planet'),
	terraria: pack('mushroom', 'moon', 'pencil'),
	smash: pack('controller', 'star', 'heart'),
	doom: pack('ghost', 'spark', 'moon'),
	roblox: pack('pencil', 'code', 'controller'),
	hades: pack('ghost', 'heart', 'spark'),
	factorio: pack('code', 'planet', 'pencil'),
	'baldurs-gate': pack('moon', 'spark', 'code'),
	'elden-ring': pack('star', 'pencil', 'moon'),
	helldivers: pack('planet', 'controller', 'star'),
	'kingdom-hearts': pack('heart', 'star', 'moon'),
	'dark-souls': pack('spark', 'ghost', 'moon'),
	'cult-of-the-lamb': pack('flower', 'ghost', 'heart'),
	xp: [
		'spark',
		'pencil',
		'code',
		'controller',
		'star',
		'heart',
		'planet',
		'flower',
		'ghost',
		'frog',
		'mushroom',
		'moon',
	],
	'long-dark': [
		'moon',
		'mushroom',
		'pencil',
		'star',
		'spark',
		'heart',
		'planet',
		'flower',
		'ghost',
		'frog',
		'controller',
		'code',
	],
	slime: [
		'frog',
		'flower',
		'mushroom',
		'heart',
		'spark',
		'star',
		'moon',
		'planet',
		'ghost',
		'controller',
		'pencil',
		'code',
	],
	halo: [
		'planet',
		'star',
		'controller',
		'spark',
		'moon',
		'heart',
		'flower',
		'ghost',
		'frog',
		'mushroom',
		'pencil',
		'code',
	],
	valorant: [
		'spark',
		'controller',
		'code',
		'star',
		'planet',
		'heart',
		'moon',
		'flower',
		'ghost',
		'frog',
		'mushroom',
		'pencil',
	],
	destiny: [
		'planet',
		'star',
		'moon',
		'controller',
		'spark',
		'heart',
		'flower',
		'ghost',
		'frog',
		'mushroom',
		'pencil',
		'code',
	],
	fortnite: [
		'controller',
		'spark',
		'star',
		'ghost',
		'planet',
		'heart',
		'moon',
		'flower',
		'frog',
		'mushroom',
		'pencil',
		'code',
	],
	ucn: [
		'ghost',
		'moon',
		'star',
		'controller',
		'spark',
		'heart',
		'planet',
		'flower',
		'frog',
		'mushroom',
		'pencil',
		'code',
	],
	rivals: [
		'spark',
		'controller',
		'planet',
		'star',
		'moon',
		'heart',
		'flower',
		'ghost',
		'frog',
		'mushroom',
		'pencil',
		'code',
	],
	deltarune: [
		'heart',
		'star',
		'ghost',
		'flower',
		'moon',
		'spark',
		'planet',
		'frog',
		'mushroom',
		'controller',
		'pencil',
		'code',
	],
}
