import { expect, test, type Page } from "@playwright/test";

/**
 * Landing page film. Needs only the web server + API (for /v1/releases and /v1/plans).
 * Run: BASE_URL=http://localhost:3105 E2E_SKIP_WARMUP=1 pnpm exec playwright test e2e/landing.spec.ts
 */

async function scrollToScene(page: Page, id: string, local: number) {
  await page.evaluate(
    ([sid, l]) => {
      const secs = [...document.querySelectorAll<HTMLElement>("[data-scene]")];
      const el = document.querySelector<HTMLElement>(`[data-scene="${sid}"]`)!;
      const last = secs[secs.length - 1] === el;
      const span = last ? el.offsetHeight - innerHeight : el.offsetHeight;
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY + span * (l as number));
    },
    [id, local] as const,
  );
  await page.waitForTimeout(900);
}

/** first visit of a session shows the preloader; wait for it to hand over */
async function open(page: Page) {
  await page.goto("/");
  await page.locator(".film-loader").waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
}

const activeScene = (page: Page) => page.locator("[data-scene][data-active]").getAttribute("data-scene");

test.describe("landing film", () => {
  test("hero, chapter order and deterministic reverse scroll", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("heading", { level: 1, name: "Sua IA trabalha mais. Você gasta menos." })).toBeVisible();
    await expect(page.locator(".film")).toHaveAttribute("data-mode", "film");

    const order = ["hero", "overload", "shift", "meet", "demo", "orbit", "quality", "assistant", "clarity", "product", "final"];
    for (const id of order) {
      await scrollToScene(page, id, 0.5);
      await expect.poll(() => activeScene(page)).toBe(id);
    }
    // backwards: same scroll position ⇒ same scene and same ORBIT stage
    await scrollToScene(page, "orbit", 0.62);
    const stageDown = await page.getByRole("tab", { selected: true, name: /—/ }).getAttribute("aria-label");
    await scrollToScene(page, "final", 0.5);
    await scrollToScene(page, "orbit", 0.62);
    await expect.poll(() => activeScene(page)).toBe("orbit");
    expect(await page.getByRole("tab", { selected: true, name: /—/ }).getAttribute("aria-label")).toBe(stageDown);
  });

  test("ORBIT demo runs the real engine samples", async ({ page }) => {
    await open(page);
    await scrollToScene(page, "demo", 0.4);
    const demo = page.locator('[data-scene="demo"]');
    await demo.getByRole("radio", { name: "Arquivo repetido" }).click();
    await expect(demo.getByText("Deduplicação de contexto")).toBeVisible();
    await expect(demo.getByText(/−\d+%/)).toBeVisible({ timeout: 10_000 });
    await demo.getByRole("tab", { name: "original" }).click();
    await expect(demo.getByRole("tab", { name: "original" })).toHaveAttribute("aria-selected", "true");
  });

  test("floating assistant opens, closes with Escape and keyboard", async ({ page }) => {
    await open(page);
    await scrollToScene(page, "assistant", 0.5);
    const btn = page.getByRole("button", { name: "Abrir painel da maindy." });
    await btn.click();
    const panel = page.getByRole("dialog", { name: "Painel rápido da maindy." });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await page.getByRole("button", { name: "Abrir painel da maindy." }).focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Fechar painel" }).click();
    await expect(panel).toBeHidden();
  });

  test("download act: real installer on Mac, honest state on Windows", async ({ browser, request }) => {
    const releases: { target: string; available: boolean; url: string | null }[] = await (await request.get("/api/v1/releases")).json();
    const mac = releases.find((r) => r.target === "macos-arm64" && r.available);
    const win = releases.find((r) => r.target === "windows-x64");

    const macCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    });
    const page = await macCtx.newPage();
    await open(page);
    await scrollToScene(page, "final", 0.85);
    const final = page.locator('[data-scene="final"]');
    if (mac) {
      // the page picks Apple Silicon vs Intel from UA Client Hints (the "Intel Mac" UA above reports x86)
      const macUrls = releases.filter((r) => r.target.startsWith("macos") && r.available).map((r) => r.url);
      const link = final.getByRole("link", { name: /Baixar maindy\./ });
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(macUrls).toContain(href);
      const head = await request.fetch(href!, { method: "HEAD" });
      expect(head.status()).toBe(200);
    }
    await final.getByRole("button", { name: "Outras plataformas" }).click();
    await expect(final.getByText("ainda não disponível").first()).toBeVisible();
    await final.getByRole("button", { name: "Explorar novamente" }).click();
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 20_000 }).toBeLessThan(50);
    await macCtx.close();

    if (win && !win.available) {
      const winCtx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      });
      const wp = await winCtx.newPage();
      await open(wp);
      await scrollToScene(wp, "final", 0.85);
      await expect(wp.getByText("A versão para Windows ainda não foi publicada.")).toBeVisible();
      await expect(wp.locator('[data-scene="final"]').getByRole("link", { name: "Criar conta" })).toHaveAttribute("href", "/cadastro");
      await winCtx.close();
    }
  });

  test("reduced motion: plain document, everything readable", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await open(page);
    await expect(page.locator(".film")).toHaveAttribute("data-mode", "flow");
    for (const name of ["Cada chamada carrega mais do que precisa.", "Cinco etapas. Só fica o que funciona.", "Sua IA trabalha mais. Você gasta menos."]) {
      await expect(page.getByRole("heading", { name }).first()).toBeAttached();
    }
    const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-r]")].filter((e) => getComputedStyle(e).visibility === "hidden" || Number(getComputedStyle(e).opacity) < 0.5).length);
    expect(hidden).toBe(0);
    await ctx.close();
  });

  test("mobile portrait: no horizontal overflow", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await open(page);
    for (const id of ["hero", "demo", "orbit", "product", "final"]) {
      await scrollToScene(page, id, 0.6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
    await ctx.close();
  });
});
