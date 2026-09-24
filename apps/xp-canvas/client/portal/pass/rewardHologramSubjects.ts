import type { RewardSkin } from '../../../shared/pass'

// Paths use percentages of each original image. The SVGs keep the originals'
// aspect ratios so the hologram mask receives the same cover crop as the art.
export const rewardSubjects: Partial<Record<RewardSkin, { label: string; width: number; height: number; shapes: string }>> = {
	'zelda-campfire': {
		label: 'Personajes', width: 1125, height: 2001,
		shapes: '<path d="M28 36 31 35 31 33 35 33 37 35 40 36 41 39 44 41 45 44 43 46 44 50 46 54 42 56 37 55 34 56 30 54 28 50 24 49 24 45 27 41Z"/><path d="M45 27 47 26 49 27 50 25 52 27 55 26 58 28 61 27 63 30 66 31 66 34 69 36 67 39 70 41 70 45 68 47 63 47 62 45 58 44 55 47 52 47 51 45 46 44 44 41 47 38 44 36 44 33Z"/><path d="M15 49 20 47 23 49 25 51 27 50 31 52 31 56 29 58 32 60 29 63 24 62 19 60 17 57 13 56Z"/><path d="M65 46 68 43 72 45 75 48 79 47 81 51 78 55 75 58 70 57 66 54 62 52Z"/><path d="M55 53 58 51 61 53 64 55 66 60 63 64 56 66 53 63 52 58Z"/>',
	},
	tracer: {
		label: 'Personaje', width: 335, height: 597,
		shapes: '<path d="M0 31 7 25 17 23 25 17 32 15 37 11 42 9 45 5 50 7 54 5 58 8 62 9 64 13 67 16 68 20 65 23 70 25 77 24 82 27 86 26 90 21 93 16 98 16 100 20 100 32 95 37 90 39 83 38 77 37 73 43 70 47 67 51 64 56 60 58 54 56 49 53 42 55 38 59 34 64 27 68 18 75 9 81 0 88V63L9 53 13 47 13 39 4 37 0 39Z"/>',
	},
	soraka: {
		label: 'Personaje', width: 2440, height: 4320,
		shapes: '<path d="M48 0 52 9 57 10 60 6 64 10 67 12 70 10 74 13 81 15 86 19 93 21 98 24 100 30 96 34 91 33 88 39 96 45 100 51V91L93 87 85 93 78 100H8L0 94V44L9 42 17 38 24 36 29 31 35 29 39 25 44 22 48 17 46 11Z"/>',
	},
	'shadow-warrior': {
		label: 'Personaje', width: 736, height: 1219,
		shapes: '<path d="M0 55 7 50 8 43 13 38 11 32 14 26 19 22 22 17 28 13 32 9 40 6 47 3 54 0H100V76L95 80 90 83 84 82 80 90 69 96 58 100H0V78L5 71 0 68Z"/>',
	},
	luke: {
		label: 'Personaje', width: 2048, height: 2048,
		shapes: '<path d="M13 100 13 89 18 81 18 71 24 65 24 58 30 52 32 42 28 39 31 32 36 27 42 22 48 20 51 14 58 11 64 9 70 12 74 17 76 23 77 29 83 34 86 41 83 48 87 55 84 62 87 69 92 76 96 85 100 91V100Z"/><path d="M16 26 20 21 25 17 31 14 39 13 46 16 49 21 50 28 48 35 43 39 36 43 27 47 18 47 14 42 14 34Z"/>',
	},
	'attack-titan': {
		label: 'Personajes', width: 1438, height: 2010,
		shapes: '<path d="M0 8 10 4 23 2 35 4 42 2 49 1 57 4 63 9 70 7 77 10 85 14 94 17 100 20V50L93 48 89 44 82 40 74 42 68 46 60 48 51 46 48 41 43 38 34 35 27 32 18 29 11 26 5 23 0 20Z"/><path d="M39 100 40 91 43 85 45 78 47 70 48 64 50 60 53 57 58 56 62 58 66 61 68 68 66 75 70 83 72 90 76 100Z"/>',
	},
	rengoku: {
		label: 'Personaje', width: 338, height: 600,
		shapes: '<path d="M0 100V49L7 43 17 40 22 36 29 31 32 26 36 21 37 17 44 14 47 11 54 13 58 9 63 13 70 11 75 15 83 15 87 21 90 27 88 31 92 38 100 43V100Z"/>',
	},
	gyro: {
		label: 'Personaje', width: 386, height: 794,
		shapes: '<path d="M0 18 8 14 17 11 23 9 29 10 34 7 40 8 49 9 57 12 65 15 67 18 61 21 59 28 65 31 72 29 77 23 82 23 87 27 85 33 94 39 100 42V100H0Z"/>',
	},
	emilia: {
		label: 'Personaje', width: 736, height: 1308,
		shapes: '<path d="M8 100 10 79 15 70 17 61 22 54 27 50 30 44 36 40 42 39 46 36 54 36 59 39 64 41 68 45 73 47 78 53 82 60 84 68 90 75 94 86 98 100Z"/>',
	},
}
