import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Telegram WebView can retain an interrupted immutable asset after a deploy.
// Stamp generated chunks so every production build gets fresh hashed URLs.
const buildReleaseId = process.env.BOTFLOW_BUILD_ID ?? Date.now().toString();

const releaseAssetHashPlugin = () => ({
  name: "botflow-release-asset-hashes",
  apply: "build" as const,
  // Vite/Rolldown does not include output.banner in a chunk filename hash.
  // This hook deliberately makes immutable JS URLs unique per release.
  augmentChunkHash: () => buildReleaseId,
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), releaseAssetHashPlugin()],
  server: {
    allowedHosts: true,
    host: true,
    hmr: {
      // При работе через ngrok браузер должен подключаться по WSS через порт 443
      clientPort: 443,
      protocol: "wss",
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React и связанные библиотеки редко меняются между деплоями —
          // выносим отдельно, чтобы браузер/WebView кэшировал их надолго
          // и не перекачивал заново при каждом обновлении вашего кода.
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          ) {
            return "vendor-react";
          }
        },
      },
    },
    // Поднимаем порог предупреждения, раз мы уже осознанно разбиваем чанки
    chunkSizeWarningLimit: 300,
  },
});
