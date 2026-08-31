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

export interface LinkDraft {
	original_url: string;
	short_url?: string;
	max_clicks?: number;
	expiration_date?: string | null;
	created_by?: number | null;
}
