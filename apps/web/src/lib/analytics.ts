/**
 * Camada de analytics sem rastreador de terceiros.
 * Os eventos vão para window.dataLayer e para um CustomEvent 'maindy:analytics'.
 * Quando houver uma ferramenta configurada (com consentimento), basta ouvir esse evento.
 */
export type AnalyticsEvent =
  | 'page_view'
  | 'hero_cta_click'
  | 'demo_interaction'
  | 'feature_section_view'
  | 'faq_open'
  | 'waitlist_form_start'
  | 'waitlist_form_submit'
  | 'waitlist_form_success'
  | 'auth_login'
  | 'auth_signup';

type Props = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function track(event: AnalyticsEvent, props: Props = {}): void {
  if (typeof window === 'undefined') return;
  const payload = { event, ...props, ts: Date.now() };
  window.dataLayer ??= [];
  window.dataLayer.push(payload);
  window.dispatchEvent(new CustomEvent('maindy:analytics', { detail: payload }));
  if (process.env.NODE_ENV === 'development') console.debug('[analytics]', payload);
}
