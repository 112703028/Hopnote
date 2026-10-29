import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  server: {
    // `wrangler dev` serves the relay on 8787.
    proxy: { "/room": { target: "http://localhost:8787", ws: true } },
  },
});
