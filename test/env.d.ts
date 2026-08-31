import type { D1Migration } from "cloudflare:test";
import type { Bindings } from "../src/index";
import type { Link, User, Visit } from "../src/types";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Bindings {
    TEST_MIGRATIONS: D1Migration[];
  }
}

export type { Link, User, Visit };
