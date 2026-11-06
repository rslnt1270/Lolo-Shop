import { defineConfig, loadEnv } from "vite";
import path from "node:path";

// Carga .env.test.local (mode "test"). Solo se usa TEST_DATABASE_URL.
const env = loadEnv("test", process.cwd(), "");

process.env.TEST_DATABASE_URL = env.TEST_DATABASE_URL || process.env.TEST_DATABASE_URL || "";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.db.test.ts", "prisma/**/*.db.test.ts", "lib/**/*.db.test.ts"],
    globalSetup: ["./test/db/global-setup.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
