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
    is_admin: true,
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

  const adminUser = {
    id: 777, telegram_id: 777, username: 'anna_test', bots_count: 1, lifetime_slots: 0,
    subscription_ends_at: '2026-09-30T00:00:00Z', subscription_auto_renew: true,
    subscription_retry_count: 0, is_disabled: false, is_platform_admin: true, created_at: '2026-08-01T09:00:00Z',
  };
  const adminBot = {
    id: 14, owner_id: 777, owner_telegram_id: 777, display_name: 'Продажа', username: 'unknown',
    tg_bot_id: 9001, status: 'draft', users_count: 0, is_token_locked: false, has_lifetime_license: false,
    funnel_complete: false, media_sync_done: true, payment_provider: 'yookassa',
    has_payment_credentials: true, created_at: '2026-08-20T10:00:00Z',
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
    if (path === '/api/billing/catalog') return ok({ products: [{ id: 'pro', name: 'Подписка бота', price: 990, period: 'month' }] });
    if (path === '/api/billing/status') return ok(user);
    if (path === '/api/billing/cancel') return ok({ ...user, subscription_auto_renew: false });
    if (path.startsWith('/api/gateway-connections')) return ok({ connections: [] });
    if (path.startsWith('/api/bots/14/audience/summary')) return ok({ all: 1248, paid: 312, unpaid: 936 });
    if (path.startsWith('/api/bots/14/audience')) {
      return ok({
        leads: [
          { telegram_id: 101, username: 'ivan_petrov', firstName: 'Иван', hasPaid: false, createdAt: '2026-08-28T10:00:00Z' },
          { telegram_id: 102, username: 'maria_k', firstName: 'Мария', hasPaid: true, createdAt: '2026-08-29T14:30:00Z' },
          { telegram_id: 103, username: null, firstName: 'Олег', hasPaid: false, createdAt: '2026-08-30T09:15:00Z' },
        ],
        total: 3,
      });
    }
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
    if (path === '/api/bots/14' && method === 'PATCH') return ok(botPayload);
    if (path === '/api/profile/notification-settings') return ok({ user });
    if (path === '/api/admin/overview') return ok({ users_total: 1, bots_total: 1, bots_active: 0, saas_payments_succeeded: 1, saas_revenue: 990, operations_requiring_attention: 0 });
    if (path.startsWith('/api/admin/users')) {
      if (path.endsWith('/access') || path.includes('/lifetime-licenses') || path.includes('/pro') || path.includes('/cancel-auto-renew')) return ok({ status: 'ok', message: 'Готово' });
      if (/\/users\/\d+$/.test(path)) return ok({ user: adminUser, bots: [adminBot] });
      return ok({ users: [adminUser] });
    }
    if (path.startsWith('/api/admin/bots')) {
      if (path.includes('/action')) return ok({ status: 'ok', message: 'Действие выполнено', botStatus: 'active' });
      if (path.includes('/readiness')) return ok({ isReady: false, reasons: ['Не заполнен Дожим 2', 'Не указана касса'] });
      if (path.includes('/archive-leads')) return ok({ archivedCount: 0 });
      return ok({ bots: [adminBot] });
    }
    if (path.startsWith('/api/admin/payments')) {
      return ok({ payments: [ { id: 'pay-1', user_id: 777, user_telegram_id: 777, product: 'pro_renewal', amount: 990, currency: 'RUB', status: 'succeeded', attempt: 1, paid_at: '2026-08-31T12:00:00Z', created_at: '2026-08-31T12:00:00Z' } ], total: 1, page: 1, limit: 25 });
    }
    if (path.startsWith('/api/admin/operations')) return ok({ operations: [], total: 0, page: 1, limit: 25 });
    if (path.startsWith('/api/admin/audit-log')) return ok({ entries: [ { id: 'a1', actor_telegram_id: 777, action: 'bot.start', target_type: 'bot', target_id: '14', details: {}, created_at: '2026-08-31T12:05:00Z' } ], total: 1, page: 1, limit: 20 });
    if (path.startsWith('/api/admin/system')) return ok({ running: true, jobs: [ { id: 'broadcast-scheduler', next_run_at: '2026-09-01T12:10:00Z', last_finished_at: '2026-09-01T12:05:00Z', last_error: null }, { id: 'subscription-renewal', next_run_at: '2026-09-02T00:00:00Z', last_finished_at: null, last_error: null } ] });
    if (path.startsWith('/api/')) return ok({});
    return window.fetchOriginal(input, init);
  };
})();
