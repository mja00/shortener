import { Hono } from 'hono';

import { api } from './routes/api';
import { redirect } from './routes/redirect';
import { web } from './routes/web';

import type { AppEnv, Bindings } from './types';

const app = new Hono<AppEnv>();

app.get('/health', c => c.text('ok'));
app.route('/api', api);
// Web routes before the redirect catch-all; Hono matches in registration
// order and /:alias would swallow /login, /links, etc.
app.route('/', web);
app.route('/', redirect);

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Bindings>;
