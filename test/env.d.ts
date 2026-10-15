import type { Bindings } from '../src/index';
import type { D1Migration } from 'cloudflare:test';

declare global {
	namespace Cloudflare {
		interface Env extends Bindings {
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}



export { type Link, type Visit, type User } from '../src/types';
