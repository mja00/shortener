export function esc(value: unknown): string {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll('\'', '&#39;');
}

export interface BaseOptions {
	title?: string;
	theme: string;
	user?: { username: string; } | null;
	msg?: string;
	msg_type?: string;
	content: string;
	userstyles?: string;
	userscripts?: string;
}

const CDN_STYLE_LINKS = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
      integrity="sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg=="
      crossorigin="anonymous" referrerpolicy="no-referrer"/>
  <link rel="stylesheet" type="text/css"
      href="https://cdn.datatables.net/v/bs5/dt-1.13.1/b-2.3.3/r-2.4.0/datatables.min.css"/>`;

export function baseLayout(opts: BaseOptions): string {
	const { title, theme, user, msg, msg_type, content, userstyles, userscripts } = opts;
	const alertType = msg_type === 'success' ? 'success' : (msg_type === 'warning' ? 'warning' : 'danger');
	const flashBlock = msg
		? `<div class="container mt-4">
    <div id="flash" class="alert alert-${alertType} alert-dismissible fade show text-center" role="alert">
        ${esc(msg)}
    </div>
  </div>`
		: '';
	const navLinks = user
		? `<li class="nav-item dropdown">
      <a class="nav-link dropdown-toggle" data-bs-toggle="dropdown" href="#" role="button" aria-haspopup="true" aria-expanded="false">
          <i class="fas fa-link"></i> Links
      </a>
      <div class="dropdown-menu">
          <a class="dropdown-item" href="/create"><i class="fas fa-plus"></i> Create Link</a>
          <div class="dropdown-divider"></div>
          <a class="dropdown-item" href="/links"><i class="fas fa-chart-line"></i> Active Links</a>
          <a class="dropdown-item" href="/links/expired"><i class="fas fa-link-slash"></i> Expired Links</a>
          <a class="dropdown-item" href="/links/deleted"><i class="fas fa-trash"></i> Deleted Links</a>
          <a class="dropdown-item" href="/visits"><i class="fas fa-eye"></i> Visits</a>
      </div>
  </li>`
		: '';
	const navUser = user
		? `<li class="nav-item dropdown">
      <a class="nav-link dropdown-toggle" data-bs-toggle="dropdown" href="#" role="button" aria-haspopup="true" aria-expanded="false"><i class="fa-solid fa-user"></i> ${esc(user.username)}</a>
      <div class="dropdown-menu dropdown-menu-end">
          <a class="dropdown-item" href="/logout"><i class="fas fa-door-open"></i> Logout</a>
      </div>
  </li>`
		: `<li class="nav-item">
      <a class="nav-link" href="/login">Login</a>
  </li>`;

	return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <meta name="title" content="URL Shortener">
    <meta name="description" content="URL shortener built on Python">
    <meta name="robots" content="index, follow">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="language" content="English">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://short.theairplan.com/">
    <meta property="og:title" content="URL Shortener">
    <meta property="og:description" content="URL Shortener built on Python">
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="https://short.theairplan.com/">
    <meta property="twitter:title" content="URL Shortener">
    <meta property="twitter:description" content="URL Shortener built on Python">
    <title>${esc(title ?? '')} | Shortener</title>
    <link rel="stylesheet" href="https://bootswatch.com/5/${esc(theme)}/bootstrap.min.css" id="bootstrap-style">
    ${CDN_STYLE_LINKS}
    ${userstyles ?? ''}
  </head>
  <body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <a class="navbar-brand" href="/">Shortener</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarColor02" aria-controls="navbarColor02" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarColor02">
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <a class="nav-link active" href="/">
                <i class="fas fa-house"></i> Home
                <span class="visually-hidden">(current)</span>
              </a>
            </li>
            ${navLinks}
          </ul>
          <ul class="navbar-nav">
            ${navUser}
          </ul>
        </div>
      </div>
    </nav>
    ${flashBlock}
    ${content}
    <footer class="bottom">
      <div class="text-center">
        <p>Crafted by <a href="https://github.com/mja00" target="_blank">mja00</a> | If you wish to <a
            href="https://github.com/sponsors/mja00" target="_blank">sponsor me</a> | <a
            href="https://twitter.com/officialmja00" target="_blank">Twitter</a></p>
      </div>
    </footer>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"
        integrity="sha256-/xUj+3OJU5yExlq6GSYGSHk7tPXikynS7ogEvDej/m4="
        crossorigin="anonymous"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-MrcW6ZMFYlzcLA8Nl+NtUVF0sA7MsXsP1UyJoMp4YLEuNSfAP+JcXn/tWtIaxVXM"
        crossorigin="anonymous"></script>
    <script type="text/javascript"
        src="https://cdn.datatables.net/v/bs5/dt-1.13.1/b-2.3.3/r-2.4.0/datatables.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>
    <script>
      // onload initialise bootstrap tooltips
      $(function () {
        var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
        var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
          return new bootstrap.Tooltip(tooltipTriggerEl)
        })
      })
    </script>
    ${userscripts ?? ''}
  </body>
</html>`;
}

