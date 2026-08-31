import nodecraftEslint from '@nodecraft/eslint-config';

export default [
	{
		ignores: ['.wrangler/', 'dist/'],
	},
	...nodecraftEslint.configs.typescript,
	{
		rules: {
			// `c` is Hono's conventional context param, `a`/`b` are sort comparators.
			'id-length': ['error', {
				exceptionPatterns: [],
				exceptions: ['i', 'x', 'y', '_', 'a', 'b', 'c', 'e'],
				min: 2,
				properties: 'never',
			}],
		},
	},
	{
		files: ['test/**/*.ts'],
		rules: {
			// Tests assert against known-good fixtures, so narrowing ceremony adds noise.
			'@typescript-eslint/no-non-null-assertion': 'off',
			'unicorn/no-await-expression-member': 'off',
		},
	},
];
