import { baseLayout } from './base';

import type { PageOptions } from './base';

// Every column renders as text or a DOM-built anchor: user agents come from
// anonymous visitors and aliases from any registered user.
const USERSCRIPTS = `<script>
  function anchor(href, label) {
    let a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    return a.outerHTML;
  }

  $(document).ready(function () {
    let text = $.fn.dataTable.render.text();
    $('#visits').DataTable({
      order: [[0, 'desc']],
      ajax: '/visits/data',
      serverSide: true,
      columns: [
        { data: 'id', orderable: false, searchable: false, visible: false },
        { data: 'shortlink.short_url', orderable: false, render: function (alias) {
            return alias ? anchor('/' + encodeURIComponent(alias), alias) : '';
          } },
        { data: 'ip_address', orderable: false, render: function (ip) {
            return anchor('https://ipinfo.io/' + encodeURIComponent(ip), ip);
          } },
        { data: 'user_agent', orderable: false, width: '40%', render: text },
        { data: 'country_name', orderable: false, render: text },
        // moment.utc keeps zone-less timestamps migrated from Postgres in UTC.
        { data: 'created_at', orderable: false, render: function (created) {
            return moment.utc(created).local().format('MM/DD/YYYY hh:mm:ss A');
          } }
      ]
    });
  });
</script>`;

export function visitsPage(opts: PageOptions): string {
	const content = `<div class="container mt-2">
  <table class="table table-striped table-hover" id="visits">
    <thead>
    <tr>
      <th>ID</th>
      <th>Shortlink</th>
      <th>IP Address</th>
      <th>User Agent</th>
      <th>Country</th>
      <th>Time (local)</th>
    </tr>
    </thead>
    <tbody>
    </tbody>
  </table>
</div>`;
	return baseLayout({ ...opts, title: 'Visits', content, userscripts: USERSCRIPTS });
}
