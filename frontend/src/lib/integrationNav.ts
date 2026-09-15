export type IntegrationTarget = 'platform' | 'cashier';

export const INTEGRATION_TARGET_KEY = 'botflow_integration_target';

export function setIntegrationTarget(target: IntegrationTarget): void {
  try {
    sessionStorage.setItem(INTEGRATION_TARGET_KEY, target);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('botflow_integration_focus', { detail: target }));
  }
}
