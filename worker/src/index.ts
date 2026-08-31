import { Hono } from "hono";

export interface Bindings {
  DB: D1Database;
  SECRET_KEY: string;
  API_KEY?: string;
  [key: string]: unknown;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.text("ok"));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Bindings>;
