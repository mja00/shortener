import { baseLayout } from './base';

// Port of templates/login.html.
export function loginPage(opts: { theme: string; msg?: string; msg_type?: string; }): string {
	const content = `<div class="container col-md-6 mt-2 mb-2">
  <div class="card">
    <div class="card-header">
      <h3>Login</h3>
    </div>
    <div class="card-body">
      <form action="/login" method="post">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" class="form-control" id="username" name="username" placeholder="Enter username" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" class="form-control" id="password" name="password" placeholder="Enter password" required>
        </div>
        <button type="submit" class="btn btn-primary">Login</button>
      </form>
    </div>
  </div>
</div>`;
	return baseLayout({ ...opts, title: 'Login', content });
}
