import { Hono } from "hono";
import { api } from "./routes/api";
import { redirect } from "./routes/redirect";

export interface Bindings {
  DB: D1Database;
  SECRET_KEY: string;
  API_KEY?: string;
  [key: string]: unknown;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => c.text("ok"));

app.route("/api", api);

// Registered after /api so the catch-all never swallows API paths; Hono
// matches in registration order.
app.route("/", redirect);

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Bindings>;
