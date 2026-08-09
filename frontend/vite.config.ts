import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
