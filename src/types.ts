export interface Bindings {
	DB: D1Database;
	SECRET_KEY: string;
	API_KEY?: string;
	API_USER_ID?: string;
	DISABLE_REGISTRATION?: string;
	NOT_FOUND_BEHAVIOR?: string;
	ROOT_REDIRECT?: string;
	THEME?: string;
}

export interface SessionUser {
	id: number;
	username: string;
}

// `user` is only set on routes behind requireSession.
export interface AppEnv {
	Bindings: Bindings;
	Variables: { user: SessionUser; };
}

export interface Link {
	id: number;
	original_url: string;
	short_url: string;
	expired: number;
	expiration_date: string | null;
	max_clicks: number;
	current_clicks: number;
	deleted: number;
	created_by: number | null;
	created_at: string;
	updated_at: string;
}

export interface User {
	id: number;
	username: string;
	password: string;
	created_at: string;
	updated_at: string;
}

export interface Visit {
	id: number;
	short_url_id: number;
	ip_address: string;
	user_agent: string;
	country: string;
	country_name: string;
	created_at: string;
	updated_at: string;
}
