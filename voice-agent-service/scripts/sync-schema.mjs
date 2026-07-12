// Prisma resolves the "nearest node_modules" for `prisma generate` starting
// from the schema FILE's own directory, not the process cwd -- pointing
// `--schema` straight at ../prisma/schema.prisma therefore generates into
// the main app's node_modules instead of this service's own, and would
// fail outright in Docker (no root node_modules exists in that build
// stage at all). Copying the schema into this service's own prisma/
// directory first makes the nearest node_modules unambiguously this
// service's own.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync(new URL("../prisma/", import.meta.url), { recursive: true });
copyFileSync(
  new URL("../../prisma/schema.prisma", import.meta.url),
  new URL("../prisma/schema.prisma", import.meta.url)
);
