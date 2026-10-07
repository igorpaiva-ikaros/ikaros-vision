import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  root: path.resolve("e2e/fixtures"),
  publicDir: path.resolve("public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/integrations/supabase/client",
        replacement: path.resolve("e2e/fixtures/storage.ts"),
      },
      { find: "@/lib/bi-context", replacement: path.resolve("e2e/fixtures/context.tsx") },
      { find: "@/lib/workspace.functions", replacement: path.resolve("e2e/fixtures/functions.ts") },
      {
        find: "@/components/bi/NewClientDialog",
        replacement: path.resolve("e2e/fixtures/new-client.tsx"),
      },
      { find: "@tanstack/react-start", replacement: path.resolve("e2e/fixtures/start.ts") },
      { find: "@", replacement: path.resolve("src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: { fs: { allow: [path.resolve(".")] } },
});
