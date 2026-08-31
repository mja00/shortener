// "type": "module" project: derive __dirname since it only exists in CJS.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.resolve(__dirname, "migrations"));

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            compatibilityDate: "2025-09-01",
            bindings: {
              SECRET_KEY: "test-secret-key",
              API_KEY: "test-api-key",
              API_USER_ID: "1",
              DISABLE_REGISTRATION: "false",
              ROOT_REDIRECT: "",
              NOT_FOUND_BEHAVIOR: "redirect",
              THEME: "darkly",
              TEST_MIGRATIONS: migrations,
            },
            d1Databases: ["DB"],
          },
        },
      },
    },
  };
});
