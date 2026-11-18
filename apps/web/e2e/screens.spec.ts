import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { deleteAccount, signupAndVerify } from "./helpers";

/** Evidence screenshots (run with SCREENS=1). Saved to docs/evidence/screens/app-*.png */
const OUT = path.resolve(process.cwd(), "../../docs/evidence/screens");
const WIDTHS = [1440, 390] as const;

test.skip(!process.env.SCREENS, "defina SCREENS=1 para gerar as capturas");

async function shot(page: Page, name: string, width: number) {
  await page.waitForLoadState("networkidle");
  // hide the Next.js dev-mode indicator from evidence captures
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `app-${name}-${width}.png`), fullPage: true });
}

for (const width of WIDTHS) {
  test(`capturas ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/login");
    await shot(page, "login", width);
    await page.goto("/cadastro?plano=pro");
    await shot(page, "cadastro", width);

    await signupAndVerify(page, "Marina Duarte");
    await page.goto("/app/overview");
    await expect(page.getByTestId("overview-empty")).toBeVisible();
    await shot(page, "overview-vazio", width);
    await page.getByTestId("demo-toggle").click();
    await expect(page.locator("[data-demo='true']")).toBeVisible();
    await shot(page, "overview-demo", width);
    if (width === 1440) {
      await page.getByRole("button", { name: "Usar tema claro" }).click();
      await shot(page, "overview-demo-claro", width);
      await page.getByRole("button", { name: "Usar tema escuro" }).click();
    }
    for (const [route, name] of [
      ["/app/orbit", "orbit"],
      ["/app/download", "download"],
      ["/app/conexoes", "conexoes"],
    ] as const) {
      await page.goto(route);
      await page.locator("main h2").first().waitFor();
      await shot(page, name, width);
    }
    await deleteAccount(page);
  });
}
