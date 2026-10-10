import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { watch: {
    ignored: ["**/qa-artifacts/**", "**/outputs/**", "**/.wrangler/**"],
    ...(process.env.CODEX_SANDBOX === "seatbelt" ? { useFsEvents: false, usePolling: true } : {}),
  } },
});
