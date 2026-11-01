import { baseLayout, esc } from './base';

import type { PageOptions } from './base';
import type { Link } from '../types';

const USERSCRIPTS = String.raw`<script>
  // Stored timestamps are ISO-8601, except rows migrated from Postgres, which
  // are space-separated and zone-less but still UTC.
  function parseStored(raw) {
    let text = (raw || '').trim();
    if (!text) return null;
    let iso = text.indexOf('T') === -1 ? text.replace(' ', 'T') : text;
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += 'Z';
    let parsed = new Date(iso);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function toLocalString(raw) {
    let parsed = parseStored(raw);
    return parsed ? parsed.toLocaleString() : raw;
  }

  function fetchInfo(id, onSuccess) {
    $.get('/links/info/' + id, function (data) {
      if (data.error) {
        alert(data.error);
        return;
      }
      onSuccess(data);
    });
  }

  // Everything goes through .text(): link fields are user-supplied.
  function showInfo(id) {
    fetchInfo(id, function (data) {
      $('#modal-title').text('Info for ' + data.short_url);
      $('#link-id').text('Link ID: ' + data.id);
      $('#link-url').text('Link URL: ' + data.short_url);
      // Only http(s) destinations become clickable so a javascript: URL can't run here.
      let destination = /^https?:/i.test(data.original_url)
        ? $('<a>').attr('href', data.original_url).text(data.original_url)
        : document.createTextNode(data.original_url);
      $('#link-destination').text('Link Destination: ').append(destination);
      $('#link-clicks').text('Link Clicks: ' + data.current_clicks);
      $('#link-max-clicks').text('Link Max Clicks: ' + (data.max_clicks === -1 ? 'Unlimited' : data.max_clicks));
      $('#link-expired').text('Link Expired: ' + data.expired);
      $('#link-expiration-date').text('Link Expiration Date: ' + (data.expiration_date ? toLocalString(data.expiration_date) : 'Never'));
      $('#link-creation-date').text('Link Creation Date: ' + toLocalString(data.created_at));
      $('#link-created-by').text('Created by: ' + data.created_by);
      $('#info-modal').modal('show');
    });
  }

  function editLink(id) {
    fetchInfo(id, function (data) {
      let form = $('#edit-form');
      form.find('[name="url"]').val(data.original_url);
      form.find('[name="alias"]').val(data.short_url);
      form.find('[name="link_id"]').val(data.id);
      form.find('[name="max_clicks"]').val(data.max_clicks);
      // datetime-local wants zone-less local wall-clock time.
      let expires = parseStored(data.expiration_date);
      if (expires) {
        expires.setMinutes(expires.getMinutes() - expires.getTimezoneOffset());
      }
      form.find('[name="expiration_date_shown"]').val(expires ? expires.toISOString().slice(0, 16) : '');
      $('#edit-modal-title').text('Editing ' + data.short_url);
      $('#edit-modal').modal('show');
    });
  }

  $('#edit-form').submit(function (e) {
    e.preventDefault();
    // Post an absolute ms epoch so the server never needs the viewer's timezone.
    let shown = $('#expiration_date_shown').val();
    $('#expiration_date').val(shown ? new Date(shown).valueOf() : '');
    $.post('/links/edit/' + $('#link_id').val(), $(this).serialize(), function (data) {
      if (data.error) {
        alert(data.error);
        return;
      }
      location.reload();
    });
  });

  $(document).ready(function () {
    // Localize before DataTables takes the rows out of the DOM for paging;
    // data-order keeps sorting on the raw timestamp.
    $('#links td.local-time').each(function () {
      $(this).text(toLocalString($(this).text()));
    });
    $('#links').DataTable({
      responsive: true,
      order: [[0, 'desc']],
      columnDefs: [
        { targets: [0], visible: false, searchable: false },
        { targets: [-1], orderable: false }
      ]
    });
  });
</script>`;

function actionButton(id: string, action: string, title: string, style: string, icon: string): string {
	return `<button data-bs-toggle="tooltip" data-bs-placement="top" title="${title}" onclick="document.forms.${id}.submit()"
        class="btn btn-${style} btn-sm"><i class="fa-solid ${icon}"></i></button>
  <form id="${id}" action="${action}" method="post"></form>`;
}

function linkRow(link: Link): string {
	const clicks = link.max_clicks === -1 ? `${link.current_clicks}` : `${link.current_clicks} / ${link.max_clicks}`;
	const actions = link.deleted
		? actionButton(`restore_${link.id}`, `/links/restore/${link.id}`, 'Restore', 'success', 'fa-undo')
		+ actionButton(`hard_delete_${link.id}`, `/links/hard_delete/${link.id}`, 'Hard Delete', 'danger', 'fa-trash-can')
		: actionButton(`delete_${link.id}`, `/links/delete/${link.id}`, 'Soft Delete', 'danger', 'fa-trash-can');
	const expiration = esc(link.expiration_date ?? '');
	const created = esc(link.created_at);
	return `<tr>
    <th scope="row">${link.id}</th>
    <td><a href="/${encodeURIComponent(link.short_url)}">${esc(link.short_url)}</a></td>
    <td>${esc(link.original_url)}</td>
    <td>${clicks}</td>
    <td class="local-time" data-order="${expiration}">${expiration}</td>
    <td class="local-time" data-order="${created}">${created}</td>
    <td>
      <div class="btn-group" role="group">
        ${actions}
        <button onclick="showInfo(${link.id})" class="btn btn-primary btn-sm"
            data-bs-toggle="tooltip" data-bs-placement="top" title="Info"><i class="fa-solid fa-eye"></i></button>
        <button onclick="editLink(${link.id})" class="btn btn-info btn-sm"
            data-bs-toggle="tooltip" data-bs-placement="top" title="Edit"><i class="fa-solid fa-edit"></i></button>
      </div>
    </td>
  </tr>`;
}

export function linksPage(opts: PageOptions & { links: Link[]; }): string {
	const rows = opts.links.map(link => linkRow(link)).join('\n');
	const content = `<div class="container mt-2">
  <table class="table table-striped table-hover" id="links">
    <thead>
    <tr>
      <th scope="col">#</th>
      <th scope="col">URL</th>
      <th scope="col">Destination</th>
      <th scope="col">Clicks</th>
      <th scope="col">Expiration Date</th>
      <th scope="col">Creation Date</th>
      <th scope="col">Actions</th>
    </tr>
    </thead>
    <tbody>
    ${rows}
    </tbody>
  </table>
  <!-- Info Modal -->
  <div class="modal" tabindex="-1" role="dialog" id="info-modal">
    <div class="modal-dialog modal-xl" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="modal-title">Info for </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <ul class="list-unstyled">
            <li id="link-id">Link ID:</li>
            <li id="link-url">Link URL:</li>
            <li id="link-destination">Link Destination:</li>
            <li id="link-clicks">Link Clicks:</li>
            <li id="link-max-clicks">Link Max Clicks:</li>
            <li id="link-expired">Link Expired:</li>
            <li id="link-expiration-date">Link Expiration Date:</li>
            <li id="link-creation-date">Link Creation Date:</li>
            <li id="link-created-by">Created by:</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>
  <!-- Edit Modal -->
  <div class="modal" tabindex="-1" role="dialog" id="edit-modal">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="edit-modal-title">Editing </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <form id="edit-form">
            <input type="hidden" id="link_id" name="link_id">
            <input type="hidden" id="expiration_date" name="expiration_date">
            <div class="row">
              <div class="col">
                <div class="form-group">
                  <label for="url">URL</label>
                  <input type="url" class="form-control" id="url" placeholder="Enter URL"
                         name="url" autocomplete="off" required>
                </div>
              </div>
              <div class="col">
                <div class="form-group">
                  <label for="alias">Alias</label>
                  <input type="text" class="form-control" id="alias" placeholder="Enter alias"
                         name="alias" autocomplete="off" required>
                </div>
              </div>
            </div>
            <div class="row">
              <div class="col">
                <div class="form-group">
                  <label for="max_clicks">Max Click Count</label>
                  <input type="number" class="form-control" id="max_clicks"
                         placeholder="-1" name="max_clicks" value="-1">
                  <small class="text-muted">Setting this value to -1 will disable the maximum</small>
                </div>
              </div>
              <div class="col">
                <div class="form-group">
                  <label for="expiration_date_shown">Expiration Date</label>
                  <input type="datetime-local" class="form-control" id="expiration_date_shown" name="expiration_date_shown">
                  <small class="text-muted">Setting this value to empty will disable the expiration</small>
                </div>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-danger" data-bs-dismiss="modal">Close</button>
          <button type="submit" class="btn btn-success" form="edit-form">Save</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
	return baseLayout({ ...opts, title: 'Links', content, userscripts: USERSCRIPTS });
}
