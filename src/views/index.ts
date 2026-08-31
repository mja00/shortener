import { baseLayout } from './base';

// Port of templates/index.html.
export function indexPage(opts: { theme: string; user?: { username: string; } | null; msg?: string; msg_type?: string; }): string {
	const content = `<div class="container-fluid mt-2">
  <h1 class="text-center">Some random URL shortener</h1>
</div>`;
	return baseLayout({ ...opts, title: 'Home', content });
}
