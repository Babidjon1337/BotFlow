import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";

interface CheckoutInfo {
  payment_id: string;
  bot_name: string;
  bot_username: string | null;
  tariff_name: string;
  tariff_description: string;
  tariff_description_html: string;
  price: number;
  old_price: number;
  is_subscription: boolean;
  recurring_period: string | null;
  button_text: string;
  has_media: boolean;
  media_url: string | null;
  lead_email: string | null;
  status: string;
  offer_url: string | null;
}

export function CheckoutPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CheckoutInfo | null>(null);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [agreedToOffer, setAgreedToOffer] = useState(false);

  const paymentId = window.location.pathname.replace(/^\/checkout\/?/, "").split("/")[0] || "";

  useEffect(() => {
    // Включаем нативный мобильный скролл
    document.documentElement.classList.add("checkout-scroll-enabled");
    document.body.classList.add("checkout-scroll-enabled");
    const rootEl = document.getElementById("root");
    if (rootEl) {
      rootEl.classList.add("checkout-scroll-enabled");
    }

    return () => {
      document.documentElement.classList.remove("checkout-scroll-enabled");
      document.body.classList.remove("checkout-scroll-enabled");
      if (rootEl) {
        rootEl.classList.remove("checkout-scroll-enabled");
      }
    };
  }, []);

  useEffect(() => {
    if (!paymentId) {
      setError("Ссылка на оплату некорректна или устарела.");
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchCheckout() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/checkout/${encodeURIComponent(paymentId)}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Счёт на оплату не найден или был аннулирован.");
          }
          throw new Error("Не удалось загрузить данные счёта. Попробуйте обновить страницу.");
        }

        const info: CheckoutInfo = await res.json();
        if (!isMounted) return;

        setData(info);
        if (info.lead_email) {
          setEmail(info.lead_email);
        }
        if (info.status === "succeeded") {
          setIsPaid(true);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Ошибка при загрузке счёта.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchCheckout();

    return () => {
      isMounted = false;
    };
  }, [paymentId]);

  const cleanEmail = email.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const hasOffer = Boolean(data?.offer_url);
  const canPay = isValidEmail && (!hasOffer || agreedToOffer) && !isSubmitting;

  async function handlePay() {
    if (!isValidEmail || (hasOffer && !agreedToOffer) || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const res = await fetch(`/api/checkout/${encodeURIComponent(paymentId)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const resData = await res.json();

      if (!res.ok) {
        throw new Error(resData.detail || "Не удалось создать платёж. Попробуйте позже.");
      }

      if (resData.status === "already_paid") {
        setIsPaid(true);
        return;
      }

      if (resData.confirmation_url) {
        window.location.href = resData.confirmation_url;
      } else {
        throw new Error("Ссылка для оплаты не получена.");
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Произошла ошибка при переходе к оплате.");
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium">Загрузка данных заказа...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Не удалось открыть счёт</h2>
          <p className="text-sm text-slate-600">{error || "Информация о заказе недоступна."}</p>
        </div>
      </div>
    );
  }

  if (isPaid) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm border border-slate-200 text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Счёт успешно оплачен!</h2>
            <p className="text-sm text-slate-600">
              Тариф «{data.tariff_name}» уже активирован. Электронный чек отправлен на указанную почту.
            </p>
          </div>
          {data.bot_username && (
            <a
              href={`https://t.me/${data.bot_username}`}
              className="inline-flex items-center justify-center w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm"
            >
              Вернуться в бота
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-slate-50 text-slate-800 flex flex-col justify-between py-6 pb-16 px-4 sm:px-6">
      <div className="max-w-md w-full mx-auto bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100 overflow-hidden">
        {/* Картинка / первый кадр тарифа */}
        {data.has_media && data.media_url && (
          <div className="relative w-full bg-slate-900/[0.03] overflow-hidden border-b border-slate-100 flex items-center justify-center min-h-[160px] max-h-[340px]">
            {/* Размытый фон под цвет изображения для гармоничного заполнения полей без обрезки */}
            <img
              src={data.media_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-30 select-none pointer-events-none"
            />
            {/* Основное изображение - без обрезки, с сохранением оригинальных пропорций */}
            <img
              src={data.media_url}
              alt={data.tariff_name}
              className="relative z-10 w-full h-auto max-h-[340px] object-contain mx-auto"
              onError={(e) => {
                // Если картинка не загрузилась, скрываем блок
                (e.target as HTMLElement).parentElement?.classList.add("hidden");
              }}
            />
          </div>
        )}

        {/* Шапка карточки */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span className="truncate max-w-[200px]">{data.bot_name}</span>
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5" /> ЮKassa 54-ФЗ
          </span>
        </div>

        {/* Основной контент */}
        <div className="p-6 pt-2 space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 leading-snug">{data.tariff_name}</h1>
          </div>

          {/* Блок цены */}
          <div className="flex items-baseline flex-wrap gap-2 pt-1 pb-3 border-b border-slate-100">
            {data.old_price > 0 && (
              <span className="text-lg line-through text-slate-400 font-medium">
                {data.old_price.toLocaleString("ru-RU")} ₽
              </span>
            )}
            <span className="text-3xl font-extrabold text-slate-900">
              {data.price > 0 ? `${data.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
            </span>
            {data.is_subscription && (
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                подписка
              </span>
            )}
          </div>

          {/* Описание тарифа */}
          {data.tariff_description_html && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                О тарифе
              </div>
              <div
                className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap break-words checkout-html-content"
                dangerouslySetInnerHTML={{ __html: data.tariff_description_html }}
              />
            </div>
          )}

          {/* Форма ввода email */}
          <div className="space-y-2 pt-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Электронная почта для чека
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (submitError) setSubmitError(null);
                }}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 250);
                }}
                placeholder="name@example.com"
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <p className="text-xs text-slate-400 leading-normal">
              Согласно закону 54-ФЗ электронный чек об оплате будет направлен на эту почту.
            </p>
          </div>

          {/* Ошибка отправки */}
          {submitError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Отдельная галочка согласия с договором оферты (только если оферта настроена) */}
          {data.offer_url && (
            <div className="pt-1 pb-1">
              <label
                htmlFor="offer-consent"
                className="flex items-start gap-2.5 cursor-pointer select-none group"
              >
                <input
                  type="checkbox"
                  id="offer-consent"
                  checked={agreedToOffer}
                  onChange={(e) => setAgreedToOffer(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600 shrink-0"
                />
                <span className="text-xs text-slate-600 leading-snug group-hover:text-slate-800 transition-colors">
                  Я согласен с условиями{" "}
                  <a
                    href={data.offer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    договора оферты
                  </a>
                </span>
              </label>
            </div>
          )}

          {/* Кнопка оплаты */}
          <button
            type="button"
            disabled={!canPay}
            onClick={handlePay}
            className={`w-full py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
              canPay
                ? "bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white cursor-pointer shadow-md shadow-blue-500/20"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Создаём счёт...</span>
              </>
            ) : (
              <span>
                {data.button_text || "Оплатить"} {data.price > 0 ? `· ${data.price.toLocaleString("ru-RU")} ₽` : ""}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Футер */}
      <footer className="text-center text-xs text-slate-400 py-6 space-y-1">
        <p className="flex items-center justify-center gap-1.5 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Безопасная оплата через платёжную систему ЮKassa
        </p>
        <p>Обработка платежей защищена сертификатом безопасности PCI DSS</p>
      </footer>

      {/* Стили для Telegram HTML внутри описания и идеального скролла на ПК и мобильных */}
      <style>{`
        html {
          overflow-y: auto !important;
          overflow-x: hidden !important;
          position: static !important;
          height: auto !important;
          min-height: 100% !important;
          min-height: 100dvh !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior: auto !important;
        }

        body,
        #root {
          overflow-y: visible !important;
          overflow-x: hidden !important;
          position: static !important;
          height: auto !important;
          min-height: 100% !important;
          min-height: 100dvh !important;
          overscroll-behavior: auto !important;
        }

        .checkout-html-content b,
        .checkout-html-content strong {
          font-weight: 700;
          color: #0f172a;
        }
        .checkout-html-content i,
        .checkout-html-content em {
          font-style: italic;
        }
        .checkout-html-content s,
        .checkout-html-content strike {
          text-decoration: line-through;
          color: #94a3b8;
        }
        .checkout-html-content u {
          text-decoration: underline;
        }
        .checkout-html-content code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background-color: #f1f5f9;
          padding: 0.15rem 0.35rem;
          border-radius: 0.25rem;
          font-size: 0.85em;
          color: #1e293b;
        }
        .checkout-html-content pre {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 0.5rem;
          border-radius: 0.375rem;
          overflow-x: auto;
          font-size: 0.85em;
          margin: 0.5rem 0;
        }
        .checkout-html-content a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
