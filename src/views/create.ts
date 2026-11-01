import { baseLayout } from './base';

import type { PageOptions } from './base';

// datetime-local is browser-local time, so post an absolute ms epoch and the server never needs the viewer's timezone.
const USERSCRIPTS = `<script>
  document.getElementById('create-form').addEventListener('submit', function () {
    let shown = document.getElementById('expiration_date_shown').value;
    document.getElementById('expiration_date').value = shown ? new Date(shown).valueOf() : '';
  });
</script>`;

export function createPage(opts: PageOptions): string {
	const content = `<div class="container mt-2">
  <div class="card">
    <div class="card-header">
      Create new short URL
    </div>
    <div class="card-body">
      <form method="POST" action="/create" id="create-form">
        <div class="row">
          <div class="col">
            <div class="form-group">
              <label for="url">URL</label>
              <input type="url" class="form-control" id="url" placeholder="Enter URL" name="url" autocomplete="off" required>
            </div>
          </div>
          <div class="col">
            <div class="form-group">
              <label for="alias">Alias</label>
              <input type="text" class="form-control" id="alias" placeholder="Enter alias"
                     name="alias" autocomplete="off">
              <small class="text-muted">Leave blank to generate a random alias.</small>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="col">
            <!-- Max view count -->
            <div class="form-group">
              <label for="max_clicks">Max Click Count</label>
              <input type="number" class="form-control" id="max_clicks"
                     placeholder="-1" name="max_clicks" value="-1">
              <small class="text-muted">Setting this value to -1 will disable the maximum</small>
            </div>
          </div>
          <div class="col">
            <!-- Expiration date -->
            <div class="form-group">
              <label for="expiration_date_shown">Expiration Date</label>
              <input type="datetime-local" class="form-control" id="expiration_date_shown" name="expiration_date_shown">
              <small class="text-muted">Setting this value to empty will disable the expiration</small>
            </div>
          </div>
          <div class="col" hidden>
            <!-- Expiration date -->
            <div class="form-group">
              <label for="expiration_date">Expiration Date</label>
              <input type="number" class="form-control" id="expiration_date" name="expiration_date">
            </div>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Submit</button>
      </form>
    </div>
  </div>
</div>`;
	return baseLayout({ ...opts, title: 'Create', content, userscripts: USERSCRIPTS });
}
