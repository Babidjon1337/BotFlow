import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { BotConfig } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const createBot = (existingCount: number): BotConfig => ({
  id: `b${existingCount + 1}`,
  name: "Новый Бот",
  username: "@new_bot",
  status: "inactive",
  usersCount: 0,
  isTokenLocked: false,
  funnelComplete: false,
});

export const BOT_AVATAR_COLORS = [
  ["#4F46E5", "#7C3AED"], // Indigo to Purple
  ["#EC4899", "#F43F5E"], // Pink to Rose
  ["#10B981", "#34D399"], // Emerald
  ["#F59E0B", "#FBBF24"], // Amber
  ["#3B82F6", "#60A5FA"], // Blue
  ["#8B5CF6", "#A78BFA"], // Violet
  ["#14B8A6", "#2DD4BF"], // Teal
  ["#F97316", "#FB923C"], // Orange
  ["#6366F1", "#818CF8"], // Indigo light
  ["#D946EF", "#E879F9"], // Fuchsia
  ["#06B6D4", "#22D3EE"], // Cyan
  ["#EF4444", "#F87171"], // Red
  ["#84CC16", "#A3E635"], // Lime
  ["#0EA5E9", "#38BDF8"], // Sky
  ["#64748B", "#94A3B8"], // Slate
];

// Simple LCG for seeded random
function lcg(seed: number) {
  return function () {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

export function getBotAvatarColors(userId: number | string, botIndex: number) {
  // Use Telegram ID as seed, fallback to a default if unavailable
  let seed = 0;
  if (typeof userId === "string") {
    for (let i = 0; i < userId.length; i++) seed += userId.charCodeAt(i);
  } else if (typeof userId === "number") {
    seed = userId;
  } else {
    seed = 1234567; // Fallback
  }

  const random = lcg(seed);

  // Create an array of available color indices [0..14]
  const indices = Array.from({ length: BOT_AVATAR_COLORS.length }, (_, i) => i);

  // Fisher-Yates shuffle with our seeded random
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Get the color for this specific bot index (wrap around if they have >15 bots)
  const colorIndex = indices[botIndex % indices.length];
  return BOT_AVATAR_COLORS[colorIndex];
}
