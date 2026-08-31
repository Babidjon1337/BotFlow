// DEV-ONLY mock: подключается в index.html, активен только при ?mock=1
(function () {
  if (!location.search.includes('mock')) return;
  window.fetchOriginal = window.fetch.bind(window);
  window.Telegram = {
    WebApp: {
      initData: 'mock-init-data',
      initDataUnsafe: { user: { first_name: 'Анна', username: 'anna_test', photo_url: '' } },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      openLink() {}, openTelegramLink() {}, expand() {}, ready() {},
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    },
  };

  const botPayload = {
    id: 14,
    displayName: 'Продажа',
    username: 'unknown',
    botUrl: 'https://t.me/botflow_bot',
    status: 'inactive',
    mediaSyncDone: true,
    tokenPreview: '123456:AAH…',
    paymentProvider: 'yookassa',
    hasPaymentCredentials: true,
    paymentCredentialsPreview: { shopId: '230456', secret: 'test_…' },
    paymentWebhookUrl: 'https://api.botflow.app/api/payments/yookassa/14',
    offerUrl: '',
    offerInstallments: false,
    usersCount: 0,
    sales: 12,
    revenue: 18000,
  };
  const user = {
    telegram_id: 777,
    subscription_status: 'active',
    subscription_until: '2026-09-30T00:00:00Z',
    slots_bought: 0,
    subscription_auto_renew: true,
    subscription_retry_count: 0,
    is_admin: false,
    email: null,
    email_receipts_enabled: true,
    email_billing_notifications_enabled: true,
  };
  const funnel = {
    funnelComplete: false,
    botStatus: 'inactive',
    readinessReasons: [],
    nodes: [
      { id: 'start', type: 'message', content: '<b>Здравствуйте!</b> Я помогу подобрать удобное время 👋', buttonText: 'Записаться', media: false, mediaFileId: null, mediaAssetId: null, mediaType: null, push_delay: '1h' },
      { id: 'push1', type: 'message', content: 'Ещё актуально? Осталось 2 места на этой неделе.', buttonText: 'Купить', media: false, mediaFileId: null, mediaAssetId: null, mediaType: null, push_delay: '24h' },
      { id: 'push2', type: 'message', content: '', buttonText: '', media: false, mediaFileId: null, mediaAssetId: null, mediaType: null, push_delay: '48h' },
      { id: 'payment', type: 'payment', paymentMode: 'auto', managerUrl: '', managerText: '', tariffSelectionText: '', tariffs: [ { id: 't1', name: 'Консультация 60 мин', price: '1500', description: '', actionType: 'link', actionData: 'https://zoom.us/j/4821', media: false, mediaFileId: null, mediaAssetId: null, mediaType: null } ] },
    ],
  };

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : String((input && input.url) || '');
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = (init && init.method) || 'GET';
    const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

    if (path === '/api/auth') return ok({ status: 'ok', user, bots: [botPayload] });
    if (path === '/api/bots' && method === 'GET') return ok({ bots: [botPayload] });
    if (path === '/api/bots' && method === 'POST') return ok(botPayload);
    if (path.startsWith('/api/bots/14/funnel')) {
      if (method === 'GET') return ok(funnel);
      return ok({ status: 'ok', funnelComplete: false, botStatus: 'inactive', stopped: false, readinessReasons: [] });
    }
    if (path.startsWith('/api/bots/14/quote')) {
      return ok({ scenarioType: 'sales_funnel', platforms: ['telegram'], currency: 'RUB', lineItems: [{ code: 'sales_funnel_base', amountMinor: 99000 }], subtotalMinor: 99000, totalMinor: 99000, checkoutAvailable: false });
    }
    if (path.startsWith('/api/bots/14/toggle')) return ok({ status: 'ok' });
    if (path.startsWith('/api/bots/14')) {
      if (method === 'PATCH') return ok(botPayload);
      return ok({ status: 'ok' });
    }
    if (path === '/api/billing/catalog') return ok({ products: [{ id: 'pro', name: 'Подписка бота', price: 990, period: 'month' }] });
    if (path === '/api/billing/status') return ok(user);
    if (path === '/api/billing/cancel') return ok({ ...user, subscription_auto_renew: false });
    if (path.startsWith('/api/gateway-connections')) return ok({ connections: [] });
    if (path.startsWith('/api/bots/14/audience/summary')) return ok({ all: 1248, paid: 312, unpaid: 936 });
    if (path.startsWith('/api/bots/14/audience')) return ok({ leads: [], total: 0 });
    if (path.startsWith('/api/bots/14/broadcasts')) {
      if (method === 'POST') {
        return ok({ id: 'b1', status: 'queued', audience: 'all', text: 'Тест', platform: 'telegram', totalRecipients: 1248, sentCount: 0, failedCount: 0, scheduledAt: null, createdAt: new Date().toISOString(), completedAt: null, lastError: null });
      }
      return ok({ broadcasts: [
        { id: 'b1', status: 'scheduled', audience: 'all', text: 'Скидка 20% на курс до конца недели!', platform: 'telegram', totalRecipients: 936, sentCount: 0, failedCount: 0, scheduledAt: '2026-09-03T10:00:00Z', createdAt: '2026-08-30T12:00:00Z', completedAt: null, lastError: null },
        { id: 'b2', status: 'sent', audience: 'paid', text: 'Спасибо за покупку! Вот ваш бонус.', platform: 'telegram', totalRecipients: 312, sentCount: 312, failedCount: 0, scheduledAt: null, createdAt: '2026-08-29T12:00:00Z', completedAt: '2026-08-29T12:20:00Z', lastError: null },
      ] });
    }
    if (path.startsWith('/api/bots/14/stats/chart')) return ok({ points: [ { date: '2026-08-25', sales: 2 }, { date: '2026-08-26', sales: 1 }, { date: '2026-08-27', sales: 3 } ] });
    if (path.startsWith('/api/bots/14/stats')) return ok({ views: 1200, clicks: 340, sales: 12, revenue: 18000 });
    if (path.startsWith('/api/bots/14/leads')) return ok({ leads: [], total: 0 });
    if (path.startsWith('/api/profile/notification-settings')) return ok({ user });
    if (path.startsWith('/api/')) return ok({});
    return window.fetchOriginal(input, init);
  };
})();
