import { Hono } from "hono";
import { redirect } from "./routes/redirect";

export interface Bindings {
  DB: D1Database;
  SECRET_KEY: string;
  API_KEY?: string;
  [key: string]: unknown;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.text("ok"));

// Registered before any future catch-all so aliases resolve first.
app.route("/", redirect);

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Bindings>;
