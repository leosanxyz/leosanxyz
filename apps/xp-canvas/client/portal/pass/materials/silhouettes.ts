import type { RewardSkin } from '../../../../shared/pass'

// Hand-traced in the material prototypes (designs/capsula/materiales) for covers that have no hologram mask.
// Percentages of the original image, like rewardHologramSubjects; Ahri was traced on its 79% crop and converted.
export const prototypeSilhouettes: Partial<Record<RewardSkin, string>> = {
	'golden-warrior': '<path d="M20 4 30 8 37 13 45 9 52 7 58 9 62 2 68 0 72 4 70 14 74 20 80 26 82 32 90 38 97 42 102 48 102 104 -2 104 -2 70 3 58 6 50 8 40 14 35 28 33 38 32 40 27 36 20 31 15 22 10Z"/>',
	'lunar-witch': '<path d="M18 4 40 2 62 2 75 6 85 14 93 20 98 25 90 27 82 30 86 40 90 50 88 62 84 72 86 85 88 104 12 104 14 85 16 72 12 60 6 48 2 38 4 26 6 18 12 10Z"/>',
	'starlight-duo': '<path d="M-4 -4 82 -4 78 7 73 13 68 18 64 23 60 28 57 32 53 36 51 42 52 50 49 57 44 61 36 62 28 60 20 58 12 57 6 52 4 46 8 40 14 36 10 33 4 30 -4 28Z"/>',
	'moon-magic': '<path d="M65.1 2 67 4 70 6 72.7 10 74 14 76.7 18 78.7 15 79.3 8 81 7 83 13 82 20 83 28 81.3 35 78 32 76.7 36 76 43 78.7 50 79.3 56 78 62 75.7 65 75.3 72 74.7 82 74 92 73.4 104 70 104 70.4 88 68.4 85 66.1 82 62.7 79 60.4 76 59.4 71 60.7 68 62.7 67 60.7 63 56.1 60 53.4 58 54.1 54 56.8 50 58.7 46 57.1 40 56.8 32 54.8 30 54.1 26 56.8 20 60.1 13 62.7 6Z"/>',
}
