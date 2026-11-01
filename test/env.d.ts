import type * as worker from '../src/index';
import type { Bindings } from '../src/types';
import type { D1Migration } from 'cloudflare:test';

declare global {
	namespace Cloudflare {
		interface Env extends Bindings {
			TEST_MIGRATIONS: D1Migration[];
		}

		// Types `exports.default` from cloudflare:workers as the worker under test.
		interface GlobalProps {
			mainModule: typeof worker;
		}
	}
}



export { type Link, type Visit, type User } from '../src/types';
