import { baseLayout } from './base';

import type { PageOptions } from './base';

export function indexPage(opts: PageOptions): string {
	const content = `<div class="container-fluid mt-2">
  <h1 class="text-center">Some random URL shortener</h1>
</div>`;
	return baseLayout({ ...opts, title: 'Home', content });
}
