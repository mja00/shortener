// Parity envelope for every link response (original ShortLink.to_dict).
import type { Link } from "../types";

export interface LinkDict {
  id: number;
  short_url: string;
  original_url: string;
  expired: boolean;
  expiration_date: string | null;
  max_clicks: number;
  current_clicks: number;
  deleted: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export function linkToDict(link: Link): LinkDict {
  return {
    id: link.id,
    short_url: link.short_url,
    original_url: link.original_url,
    expired: !!link.expired,
    expiration_date: link.expiration_date,
    max_clicks: link.max_clicks,
    current_clicks: link.current_clicks,
    deleted: !!link.deleted,
    created_by: link.created_by,
    created_at: link.created_at,
    updated_at: link.updated_at,
  };
}
