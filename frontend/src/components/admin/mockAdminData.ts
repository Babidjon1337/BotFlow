export type DemoSubscription = "pro" | "license" | "expired";

export interface DemoAdminUser {
  id: string;
  name: string;
  username: string;
  subscription: DemoSubscription;
  licenses: number;
  bots: number;
  lastActive: string;
  paymentState: "paid" | "retry" | "expired";
}

export interface DemoAdminBot {
  id: string;
  name: string;
  owner: string;
  status: "active" | "paused";
  entitlement: "PRO" | "Лицензия" | "Нет доступа";
  leads: number;
  updatedAt: string;
}

export const demoUsers: DemoAdminUser[] = [
  { id: "u-001", name: "Анна Смирнова", username: "@anna_course", subscription: "pro", licenses: 2, bots: 4, lastActive: "8 мин назад", paymentState: "paid" },
  { id: "u-002", name: "Михаил Орлов", username: "@mikhail_sales", subscription: "license", licenses: 3, bots: 3, lastActive: "42 мин назад", paymentState: "paid" },
  { id: "u-003", name: "Дарья Власова", username: "@dasha_studio", subscription: "expired", licenses: 1, bots: 3, lastActive: "Вчера", paymentState: "retry" },
  { id: "u-004", name: "Илья Воронов", username: "@voronov_lab", subscription: "pro", licenses: 1, bots: 6, lastActive: "Вчера", paymentState: "paid" },
];

export const demoBots: DemoAdminBot[] = [
  { id: "b-101", name: "Курс Анны", owner: "Анна Смирнова", status: "active", entitlement: "PRO", leads: 1240, updatedAt: "8 мин назад" },
  { id: "b-102", name: "Продажи Михаила", owner: "Михаил Орлов", status: "active", entitlement: "Лицензия", leads: 862, updatedAt: "42 мин назад" },
  { id: "b-103", name: "Клуб Дарьи", owner: "Дарья Власова", status: "paused", entitlement: "Нет доступа", leads: 431, updatedAt: "Вчера" },
  { id: "b-104", name: "Лаборатория Ильи", owner: "Илья Воронов", status: "active", entitlement: "PRO", leads: 2934, updatedAt: "Вчера" },
];

export const demoPayments = [
  { id: "p-01", customer: "Анна Смирнова", product: "PRO", amount: "3 000 ₽", status: "Успешно", at: "Сегодня, 11:24" },
  { id: "p-02", customer: "Дарья Власова", product: "PRO — попытка 2 из 3", amount: "3 000 ₽", status: "Нужна попытка", at: "Сегодня, 09:00" },
  { id: "p-03", customer: "Михаил Орлов", product: "Лицензия", amount: "2 000 ₽", status: "Успешно", at: "Вчера, 18:42" },
];

export const demoEvents = [
  "Автосписание PRO подтверждено для @anna_course",
  "Бот «Клуб Дарьи» остановлен после окончания PRO",
  "Михаил Орлов активировал лицензионного бота",
  "Планировщик повторных списаний обработал 2 задачи",
];
