import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Hopnote",
        short_name: "Hopnote",
        display: "standalone",
        start_url: "/",
        background_color: "#f6f7f9",
        theme_color: "#3b6ef5",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      // The service worker must never answer relay requests.
      workbox: { navigateFallbackDenylist: [/^\/room\//] },
    }),
  ],
  server: {
    // `wrangler dev` serves the relay on 8787.
    proxy: { "/room": { target: "http://localhost:8787", ws: true } },
  },
});
