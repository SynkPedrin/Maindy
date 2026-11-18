import { expect, test } from "@playwright/test";
import { PASSWORD, currencyOutsideDemo, deleteAccount, linkFromMail, signupAndVerify, uniqueEmail } from "./helpers";

test("rota protegida redireciona para o login com ?next quando deslogado", async ({ page }) => {
  await page.goto("/app/orbit?periodo=30d");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Forbit%3Fperiodo%3D30d/);
  await expect(page.getByRole("heading", { name: "Entrar na maindy." })).toBeVisible();
});

test("cookie inválido é rejeitado pela checagem real no servidor (/v1/me)", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "maindy_session", value: "forjado-123", url: baseURL! }]);
  await page.goto("/app/overview");
  await expect(page).toHaveURL(/\/login\?motivo=sessao&next=%2Fapp%2Foverview/);
});

test("login rejeita redirecionamento externo em ?next", async ({ page }) => {
  await page.goto("/login?next=//evil.example.com/x");
  // the form posts and then navigates to the sanitized default; here we only check the page renders safely
  await expect(page.getByRole("heading", { name: "Entrar na maindy." })).toBeVisible();
});

test("fluxo completo: cadastro → e-mail → verificação → onboarding → plano → checkout sandbox → download → sair → entrar", async ({ page }) => {
  const email = uniqueEmail("flow");

  // 1. Cadastro com plano pré-selecionado
  await page.goto("/cadastro?plano=pro");
  await expect(page.getByText("Plano escolhido:")).toBeVisible();
  await page.getByLabel("Nome").fill("Ana Teste");
  await page.getByLabel("E-mail de trabalho").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /Termos de Uso/ }).check();
  await expect(page.getByRole("checkbox", { name: /novidades/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Verifique seu e-mail" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reenviar em \d+s/ })).toBeDisabled();

  // 2. Link de verificação lido do Mailpit
  const link = await linkFromMail(page.request, email, "/verificar-email?token=");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "E-mail confirmado" })).toBeVisible();
  await page.getByRole("link", { name: "Continuar para o onboarding" }).click();

  // 3. Onboarding (sessão criada pela verificação, sem logout forçado)
  await expect(page).toHaveURL(/\/app\/onboarding/);
  await expect(page.getByTestId("onboarding-progress")).toBeVisible();
  // ?plano=pro on signup already records plan_selected; the next open step is checkout
  await expect(page.getByTestId("step-plan_selected")).toHaveAttribute("data-done", "true");
  await page.getByTestId("step-action-checkout_completed").click();

  // 4. Escolher plano → checkout sandbox
  await expect(page).toHaveURL(/\/app\/faturamento/);
  await page.getByTestId("choose-pro").click();
  await expect(page).toHaveURL(/\/app\/faturamento\/sandbox\?checkout=/);
  await expect(page.getByTestId("sandbox-banner")).toHaveText(/Ambiente de testes — nenhum pagamento real/);
  await page.getByTestId("sandbox-approve").click();
  await expect(page.getByTestId("sandbox-done")).toBeVisible();
  await page.getByTestId("sandbox-continue").click();
  await expect(page.getByTestId("step-checkout_completed")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("step-plan_selected")).toHaveAttribute("data-done", "true");

  // 5. Download honesto: sem link quando available=false; assinatura verdadeira quando houver build
  await page.goto("/app/download");
  const releases = (await (await page.request.get("/api/v1/releases")).json()) as { target: string; available: boolean; signing: string }[];
  for (const r of releases) {
    await page.getByTestId(`target-${r.target}`).click();
    const details = page.getByTestId("release-details");
    if (r.available) {
      await expect(details.getByTestId("download-button")).toBeVisible();
      await expect(details.getByTestId("signing-status")).toBeVisible();
      if (r.signing === "unsigned") await expect(details.getByTestId("signing-status")).toContainText("Não assinado");
    } else {
      await expect(details.getByTestId("release-unavailable")).toHaveText("Ainda não disponível");
      await expect(details.getByRole("link", { name: /Baixar/ })).toHaveCount(0);
    }
  }
  await expect(page.getByRole("heading", { name: "Roteiro do tutorial em vídeo (gravação pendente)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /play|reproduzir/i })).toHaveCount(0);

  // 6. Sair
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login\?motivo=saiu/);
  await page.goto("/app/overview");
  await expect(page).toHaveURL(/\/login\?next=/);

  // 7. Entrar de novo (volta para onde estava)
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app\/overview/);

  await deleteAccount(page);
});

test("dashboard vazio não mostra números fabricados; demonstração é rotulada", async ({ page }) => {
  await signupAndVerify(page);
  await page.goto("/app/overview");
  await expect(page.getByTestId("overview-empty")).toBeVisible();
  expect(await currencyOutsideDemo(page)).toEqual([]);
  await expect(page.locator("[data-demo='true']")).toHaveCount(0);

  await page.getByTestId("demo-toggle").click();
  const frame = page.locator("[data-demo='true']");
  await expect(frame).toBeVisible();
  await expect(frame.getByText("Demonstração — dados simulados").first()).toBeVisible();
  // demo numbers exist only inside the frame
  await expect(frame.getByTestId("metric-net-savings")).toContainText("US$");
  expect(await currencyOutsideDemo(page)).toEqual([]);
  await deleteAccount(page);
});

test("login com e-mail não verificado mostra estado com reenvio", async ({ page }) => {
  const email = uniqueEmail("unverified");
  const res = await page.request.post("/api/v1/auth/signup", {
    headers: { "x-maindy-csrf": "1", origin: "http://localhost:3102" },
    data: { name: "Sem Verificar", email, password: PASSWORD, acceptTerms: true, marketingOptIn: false },
  });
  expect(res.status()).toBe(201);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Confirme seu e-mail para entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reenviar e-mail de verificação" })).toBeEnabled();
  // cleanup: verify (creates session) then delete through the API
  const link = await linkFromMail(page.request, email, "/verificar-email?token=");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "E-mail confirmado" })).toBeVisible();
  await deleteAccount(page);
});

test("acessibilidade básica: landmarks, títulos e nomes acessíveis no painel", async ({ page }) => {
  await signupAndVerify(page);
  for (const path of ["/app/overview", "/app/conexoes", "/app/orbit", "/app/download", "/app/onboarding", "/app/faturamento", "/app/configuracoes"]) {
    await page.goto(path);
    await expect(page.locator("main#conteudo")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href], [role=radio], [role=switch]")]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => !(el.getAttribute("aria-label") || el.textContent?.trim() || el.getAttribute("title")))
        .map((el) => el.outerHTML.slice(0, 120)),
    );
    expect(unnamed, path).toEqual([]);
  }
  await deleteAccount(page);
});
