import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// This ensures the local .env file is loaded when running CLI commands
dotenv.config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // This dynamically points to the database URL defined in your environment
    url: process.env.DATABASE_URL,
  },
});
