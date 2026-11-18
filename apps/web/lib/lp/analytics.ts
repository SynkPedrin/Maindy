/**
 * Landing-page conversion events (download impressions/clicks, demo use).
 * Privacy by design: there is NO network call here and no cookie. Events are pushed to
 * `window.dataLayer` only if the site owner installs a consented tag manager that defines it,
 * and are always dispatched as a DOM CustomEvent (`maindy:analytics`) for first-party listeners.
 * Global Privacy Control / Do Not Track turn the dataLayer push off.
 */
type Props = Record<string, string | number | boolean | null>;

export function track(event: string, props: Props = {}) {
  if (typeof window === "undefined") return;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const optedOut = nav.globalPrivacyControl === true || nav.doNotTrack === "1";
  const payload = { event: `lp_${event}`, ...props };
  try {
    window.dispatchEvent(new CustomEvent("maindy:analytics", { detail: payload }));
    const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
    if (!optedOut && Array.isArray(dl)) dl.push(payload);
  } catch {}
}
