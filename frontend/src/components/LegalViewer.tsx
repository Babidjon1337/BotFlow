import { useEffect, useState } from "react";
import { AlertCircle, Download, ExternalLink, FileText, Loader2 } from "lucide-react";

export function LegalViewer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const slug = window.location.pathname.replace(/^\/legal\/?/, "").split("/")[0] || "";

  useEffect(() => {
    if (!slug) {
      setError("Ссылка на документ некорректна или устарела.");
      setLoading(false);
      return;
    }

    let isMounted = true;
    let createdBlobUrl: string | null = null;

    async function fetchDocument() {
      try {
        setLoading(true);
        setError(null);

        // Сначала пробуем /api/legal/{slug}, так как /api гарантированно проксируется Nginx
        let res = await fetch(`/api/legal/${encodeURIComponent(slug)}`);
        if (!res.ok && res.status !== 404) {
          // Запасной вариант — прямой /legal/{slug}
          res = await fetch(`/legal/${encodeURIComponent(slug)}`);
        }

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Документ оферты не найден или был удалён.");
          }
          throw new Error("Не удалось загрузить документ. Попробуйте обновить страницу.");
        }

        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("application/pdf")) {
          const blob = await res.blob();
          if (!isMounted) return;
          createdBlobUrl = URL.createObjectURL(blob);
          setPdfUrl(createdBlobUrl);
        } else {
          const html = await res.text();
          if (!isMounted) return;
          setHtmlContent(html);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Ошибка при загрузке документа.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchDocument();

    return () => {
      isMounted = false;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#f8f9fa] p-4 text-[#1c1c1e] dark:bg-[#121214] dark:text-[#f2f2f7]">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-medium text-fg-secondary">Загрузка документа оферты…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#f8f9fa] p-4 text-[#1c1c1e] dark:bg-[#121214] dark:text-[#f2f2f7]">
        <div className="flex max-w-[420px] flex-col items-center rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-danger-soft text-danger">
            <AlertCircle className="size-6" />
          </div>
          <h1 className="text-lg font-semibold">Документ недоступен</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{error}</p>
        </div>
      </div>
    );
  }

  if (pdfUrl) {
    return (
      <div className="relative flex h-screen w-screen flex-col bg-[#525659]">
        {/* Панель управления на случай, если на мобильном браузере встроенный PDF не отобразится */}
        <header className="flex h-12 w-full shrink-0 items-center justify-between border-b border-black/10 bg-[#323639] px-4 text-white">
          <div className="flex items-center gap-2">
            <FileText className="size-4 opacity-80" />
            <span className="text-sm font-medium">Публичная оферта (PDF)</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/api/legal/${encodeURIComponent(slug)}`}
              download="offer.pdf"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
            >
              <Download className="size-3.5" />
              <span>Скачать</span>
            </a>
            <a
              href={`/api/legal/${encodeURIComponent(slug)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
            >
              <ExternalLink className="size-3.5" />
              <span>Открыть отдельно</span>
            </a>
          </div>
        </header>
        <iframe
          src={pdfUrl}
          title="Публичная оферта"
          className="h-[calc(100vh-48px)] w-full border-none"
        />
      </div>
    );
  }

  if (htmlContent) {
    return (
      <iframe
        srcDoc={htmlContent}
        title="Публичная оферта"
        className="h-screen w-screen border-none"
      />
    );
  }

  return null;
}
