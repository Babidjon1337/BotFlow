import type { FunnelNode, PaymentProvider } from './types';

export const INITIAL_BLOCKS: FunnelNode[] = [
  {
    id: 'start',
    step: 'Старт',
    subtitle: 'Первое сообщение',
    delay: '0 мин',
    kind: 'message',
    content: '',
    buttonText: '',
    x: 250,
    y: 50,
  },
  {
    id: 'push1',
    step: 'Дожим 1',
    subtitle: 'Через 1 час',
    delay: '1 час',
    kind: 'reminder',
    content: '',
    buttonText: '',
    x: 250,
    y: 200,
  },
  {
    id: 'push2',
    step: 'Дожим 2',
    subtitle: 'Через 24 часа',
    delay: '24 часа',
    kind: 'reminder',
    content: '',
    buttonText: '',
    x: 250,
    y: 350,
  },
  {
    id: 'payment',
    step: 'Оплата',
    subtitle: 'Счет на оплату',
    delay: 'Мгновенно',
    kind: 'payment',
    content: '',
    buttonText: '',
    paymentMode: 'auto',
    tariffs: [
      { id: 't1', name: '', price: 0, description: '', actionType: 'link', actionData: '' }
    ],
    x: 500,
    y: 200,
  }
];

export const TIMER_PRESETS: string[] = ['1ч', '6ч', '12ч', '24ч', '48ч'];

export const PAYMENT_PROVIDERS: Record<PaymentProvider, { key: string; label: string; hint: string }[]> = {
  yookassa: [
    { key: 'shop_id',    label: 'Shop ID',     hint: '123456' },
    { key: 'secret_key', label: 'Секретный ключ', hint: 'test_xxxxxx' },
  ],
  robokassa: [
    { key: 'merchant_login',  label: 'Merchant Login', hint: 'my_shop' },
    { key: 'password1',       label: 'Пароль 1',       hint: 'pass1' },
    { key: 'password2',       label: 'Пароль 2',       hint: 'pass2' },
    { key: 'hash_algorithm',  label: 'Алгоритм подписи', hint: 'md5, sha256 или sha512' },
  ],
  prodamus: [
    { key: 'api_key',   label: 'API Ключ',     hint: 'prodamus_xxxxx' },
    { key: 'domain',    label: 'Домен',        hint: 'myshop.payform.ru' },
    { key: 'sys',       label: 'Код интеграции SYS', hint: 'Код, согласованный с Prodamus' },
  ],
};
