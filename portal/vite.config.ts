import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        // Without the API server running, answer quietly so the UI falls back to the local agent.
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            const r = res as import("node:http").ServerResponse;
            if (!r.headersSent) r.writeHead(503, { "content-type": "application/json" });
            r.end(JSON.stringify({ ok: false, llm: false }));
          });
        },
      },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
