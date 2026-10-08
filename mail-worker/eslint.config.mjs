import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Correctness rules only, as errors. Style is Prettier's job (.prettierrc),
// and style-ish rules are off so the existing codebase passes unchanged.
export default [
	{ ignores: ['node_modules/**', '.wrangler/**', 'dist/**'] },
	js.configs.recommended,
	{ ...tseslint.configs.base, files: ['**/*.ts'] },
	{
		files: ['**/*.{js,mjs,ts}'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: { ...globals.serviceworker, ...globals.node },
		},
		rules: {
			'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
			'no-empty': ['error', { allowEmptyCatch: true }],
			'no-useless-escape': 'off',
			'no-prototype-builtins': 'off',
			'no-case-declarations': 'off',
			'no-cond-assign': 'off',
			'no-control-regex': 'off',
			// Newer recommended rules that flag long-standing code; surfaced as
			// warnings so they get fixed when the file is touched, not in one sweep.
			'no-useless-assignment': 'warn',
			'preserve-caught-error': 'warn',
			'no-extra-boolean-cast': 'warn',
			'no-misleading-character-class': 'warn',
		},
	},
];
