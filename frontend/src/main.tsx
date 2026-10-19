import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LegalViewer } from "./components/LegalViewer";
import { CheckoutPage } from "./components/CheckoutPage";

// Ленивая загрузка основного приложения конструктора,
// чтобы страницы оплаты (/checkout) и оферты (/legal) открывались мгновенно
const App = lazy(() => import("./App.tsx"));
const AlertProvider = lazy(() =>
  import("./components/AlertProvider").then((m) => ({ default: m.AlertProvider }))
);
const AppStateProvider = lazy(() =>
  import("./providers/AppStateProvider").then((m) => ({ default: m.AppStateProvider }))
);

// Если динамический import() не может найти чанк (устаревший index.html
// после нового деплоя фронтенда) — Vite эмитит это событие вместо того,
// чтобы просто упасть в ErrorBoundary. Перезагружаем страницу, чтобы
// подтянуть свежий index.html со свежими ссылками на чанки.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

const isLegalRoute = window.location.pathname.startsWith("/legal/");
const isCheckoutRoute = window.location.pathname.startsWith("/checkout/");

if (isCheckoutRoute) {
  document.documentElement.classList.add("checkout-scroll-enabled");
  document.body.classList.add("checkout-scroll-enabled");
  document.getElementById("root")?.classList.add("checkout-scroll-enabled");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isLegalRoute ? (
        <LegalViewer />
      ) : isCheckoutRoute ? (
        <CheckoutPage />
      ) : (
        <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
          <AlertProvider>
            <AppStateProvider>
              <App />
            </AppStateProvider>
          </AlertProvider>
        </Suspense>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
