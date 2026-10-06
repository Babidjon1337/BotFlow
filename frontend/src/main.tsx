import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AlertProvider } from "./components/AlertProvider";
import { AppStateProvider } from "./providers/AppStateProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { LegalViewer } from "./components/LegalViewer";

// Если динамический import() не может найти чанк (устаревший index.html
// после нового деплоя фронтенда) — Vite эмитит это событие вместо того,
// чтобы просто упасть в ErrorBoundary. Перезагружаем страницу, чтобы
// подтянуть свежий index.html со свежими ссылками на чанки.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

const isLegalRoute = window.location.pathname.startsWith("/legal/");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isLegalRoute ? (
        <LegalViewer />
      ) : (
        <AlertProvider>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </AlertProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
