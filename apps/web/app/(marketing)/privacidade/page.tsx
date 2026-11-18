import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/components/marketing/content";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como a maindy. trata dados pessoais e metadados de uso de IA, conforme a LGPD. Minuta sujeita a revisão jurídica.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacidadePage() {
  return (
    <LegalPage
      eyebrow="Privacidade · LGPD"
      title="Política de privacidade"
      updated="18 de novembro de 2026"
      intro={
        <p>
          A maindy. foi desenhada para funcionar com o mínimo de dados possível. O princípio central: <strong>o texto dos seus prompts e das
          respostas dos modelos fica na sua máquina por padrão</strong>. Para a nuvem vão apenas metadados necessários para medir custo e
          economia.
        </p>
      }
      sections={[
        {
          id: "controlador",
          title: "Quem é o controlador",
          body: (
            <p>
              O controlador dos dados é a empresa responsável pela maindy. Os dados societários completos (razão social, CNPJ e endereço) e o
              contato do encarregado (DPO) serão publicados nesta página antes do lançamento comercial. Até lá, solicitações podem ser enviadas
              para <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> (endereço a confirmar).
            </p>
          ),
        },
        {
          id: "dados",
          title: "Quais dados tratamos",
          body: (
            <>
              <h3>Dados de conta</h3>
              <ul>
                <li>Nome, e-mail e senha (armazenada apenas como hash).</li>
                <li>Organização, papéis e membros convidados.</li>
                <li>Sessões e dispositivos pareados (para que você possa revogá-los).</li>
              </ul>
              <h3>Metadados de uso de IA</h3>
              <ul>
                <li>Provedor, modelo, endpoint, contagem de tokens, custo, latência, status e técnica aplicada por requisição.</li>
                <li>Hashes não reversíveis usados para deduplicação, nunca o texto original.</li>
                <li>Origem de cada número: reportado pelo provedor, medido localmente, estimado ou indisponível.</li>
              </ul>
              <h3>O que não coletamos por padrão</h3>
              <ul>
                <li>Texto de prompts e respostas.</li>
                <li>Chaves de API: ficam no Keychain (macOS) ou no cofre de credenciais do Windows; guardamos apenas uma referência.</li>
                <li>Cookies, tokens ou credenciais de assinaturas de terceiros (Claude, ChatGPT, Codex).</li>
              </ul>
            </>
          ),
        },
        {
          id: "finalidades",
          title: "Finalidades e bases legais",
          body: (
            <ul>
              <li>
                <strong>Execução de contrato:</strong> criar e manter sua conta, medir uso e economia, emitir relatórios e cobrar a assinatura.
              </li>
              <li>
                <strong>Legítimo interesse:</strong> segurança, prevenção a fraude e abuso (por exemplo, limites de tentativas de login).
              </li>
              <li>
                <strong>Obrigação legal:</strong> registros fiscais e de faturamento.
              </li>
              <li>
                <strong>Consentimento:</strong> recursos opcionais, como análise de uso do site ou envio de conteúdo para diagnóstico. Você pode
                revogar a qualquer momento.
              </li>
            </ul>
          ),
        },
        {
          id: "compartilhamento",
          title: "Compartilhamento",
          body: (
            <>
              <p>
                Não vendemos dados. Compartilhamos apenas com operadores necessários ao serviço (hospedagem, e-mail transacional e processador de
                pagamentos), sob contrato e com as mesmas exigências de segurança.
              </p>
              <p>
                As requisições aos provedores de IA são feitas <strong>diretamente da sua máquina, com a sua chave</strong>. A relação com cada
                provedor é regida pelos termos dele.
              </p>
            </>
          ),
        },
        {
          id: "retencao",
          title: "Retenção e segurança",
          body: (
            <>
              <p>
                Mantemos metadados de uso pelo período necessário para relatórios e auditoria, com retenção configurável por organização. Dados de
                conta são mantidos enquanto a conta estiver ativa e pelo prazo legal aplicável após o encerramento.
              </p>
              <p>
                Usamos criptografia em trânsito e em repouso, sessões revogáveis, controle de acesso por papel e registros de auditoria. Nunca
                registramos prompts, segredos, cookies ou tokens em logs.
              </p>
            </>
          ),
        },
        {
          id: "direitos",
          title: "Seus direitos",
          body: (
            <>
              <p>Conforme a LGPD, você pode:</p>
              <ul>
                <li>Confirmar a existência de tratamento e acessar seus dados.</li>
                <li>Exportar seus dados em formato legível (disponível na área da conta).</li>
                <li>Corrigir dados incompletos ou desatualizados.</li>
                <li>Excluir sua conta e seus dados, ressalvadas obrigações legais.</li>
                <li>Revogar consentimentos e revogar sessões e dispositivos.</li>
              </ul>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              Usamos apenas o cookie de sessão necessário para manter você conectado (httpOnly). O site público não carrega scripts de terceiros nem
              analytics sem o seu consentimento.
            </p>
          ),
        },
        {
          id: "alteracoes",
          title: "Alterações",
          body: <p>Mudanças relevantes nesta política serão comunicadas por e-mail e nesta página, com a data de atualização.</p>,
        },
      ]}
    />
  );
}
