// "type": "module" project: derive __dirname since it only exists in CJS.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
	const migrations = await readD1Migrations(path.resolve(__dirname, 'migrations'));

	return {
		plugins: [
			cloudflareTest({
				wrangler: { configPath: './wrangler.toml' },
				miniflare: {
					compatibilityDate: '2025-09-01',
					bindings: {
						SECRET_KEY: 'test-secret-key',
						API_KEY: 'test-api-key',
						API_USER_ID: '1',
						DISABLE_REGISTRATION: 'false',
						ROOT_REDIRECT: '',
						NOT_FOUND_BEHAVIOR: 'redirect',
						THEME: 'darkly',
						TEST_MIGRATIONS: migrations,
					},
					d1Databases: ['DB'],
				},
			}),
		],
		test: {
			setupFiles: ['./test/apply-migrations.ts'],
		},
	};
});
