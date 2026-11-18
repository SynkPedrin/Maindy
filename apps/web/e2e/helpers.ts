import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
export const PASSWORD = "Orbita-Segura-2026!";

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@maindy.test`;
}

/** Polls Mailpit for the newest message to `email` and returns the path+query of the first link matching `pathPrefix`. */
export async function linkFromMail(request: APIRequestContext, email: string, pathPrefix: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`);
    if (res.ok()) {
      const body = (await res.json()) as { messages: { ID: string }[] };
      for (const m of body.messages ?? []) {
        const msg = await (await request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
        const text: string = `${msg.HTML ?? ""}\n${msg.Text ?? ""}`;
        const re = new RegExp(`https?://[^\\s"'<>]+(${pathPrefix.replace(/[/?]/g, "\\$&")}[^\\s"'<>]*)`);
        const match = text.match(re);
        if (match) return match[1].replace(/&amp;/g, "&");
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Nenhum e-mail com link ${pathPrefix} para ${email}`);
}

/** Creates an account through the same-origin API proxy and verifies it in the browser (which also logs in). */
export async function signupAndVerify(page: Page, name = "Teste E2E") {
  const email = uniqueEmail("auto");
  const origin = new URL(process.env.BASE_URL ?? "http://localhost:3102").origin;
  const res = await page.request.post("/api/v1/auth/signup", {
    headers: { "x-maindy-csrf": "1", origin },
    data: { name, email, password: PASSWORD, acceptTerms: true, marketingOptIn: false },
  });
  expect(res.status(), await res.text()).toBe(201);
  const link = await linkFromMail(page.request, email, "/verificar-email?token=");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "E-mail confirmado" })).toBeVisible();
  return { email, password: PASSWORD };
}

/** Deletes the test account through the API's account delete endpoint (the only allowed cleanup path). */
export async function deleteAccount(page: Page, password = PASSWORD) {
  const origin = new URL(page.url()).origin;
  const res = await page.request.delete("/api/v1/account", {
    headers: { "x-maindy-csrf": "1", origin },
    data: { confirm: "EXCLUIR", password },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Currency amounts like "US$ 1,23" or "R$ 39" rendered outside any demo frame. */
export async function currencyOutsideDemo(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const re = /(US\$|R\$|€)\s?\d/;
    const out: string[] = [];
    const walker = document.createTreeWalker(document.querySelector("main") ?? document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = n.textContent ?? "";
      if (re.test(t) && !(n.parentElement?.closest("[data-demo='true']"))) out.push(t.trim());
    }
    return out;
  });
}
