import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/components/marketing/content";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Termos de uso da maindy.: assinatura, responsabilidades, integrações com provedores de IA e Economy Guarantee. Minuta sujeita a revisão jurídica.",
  alternates: { canonical: "/termos" },
};

export default function TermosPage() {
  return (
    <LegalPage
      eyebrow="Termos"
      title="Termos de uso"
      updated="18 de novembro de 2026"
      intro={
        <p>
          Estes termos regem o uso do site, do painel e dos aplicativos da maindy. Ao criar uma conta, você concorda com eles e com a{" "}
          <Link href="/privacidade">política de privacidade</Link>.
        </p>
      }
      sections={[
        {
          id: "servico",
          title: "O serviço",
          body: (
            <p>
              A maindy. é uma camada de eficiência para uso de IA: um gateway local, um aplicativo desktop e um painel que medem, otimizam e
              reportam o consumo das suas integrações autorizadas. A maindy. não é um provedor de modelos de IA e não revende cotas de terceiros.
            </p>
          ),
        },
        {
          id: "conta",
          title: "Conta e segurança",
          body: (
            <ul>
              <li>Você é responsável pelas credenciais da sua conta e pelas chaves de API que conectar.</li>
              <li>É necessário e-mail verificado. Sessões e dispositivos podem ser revogados a qualquer momento.</li>
              <li>Uso que viole leis, termos de provedores ou tente contornar limites de serviço é proibido.</li>
            </ul>
          ),
        },
        {
          id: "provedores",
          title: "Provedores de IA e integrações",
          body: (
            <>
              <p>
                Você mantém a relação contratual e de cobrança diretamente com cada provedor (OpenAI, Anthropic e outros). A maindy. usa apenas
                interfaces oficiais e autorizadas.
              </p>
              <ul>
                <li>Não alteramos limites semanais ou de sessão de Claude, ChatGPT ou Codex.</li>
                <li>Não reutilizamos o login de assinaturas como API nem coletamos cookies ou tokens dessas contas.</li>
                <li>Integrações parciais ou não suportadas são indicadas como tal no produto.</li>
              </ul>
            </>
          ),
        },
        {
          id: "assinatura",
          title: "Assinatura, cobrança e cancelamento",
          body: (
            <>
              <p>
                Os planos são cobrados de forma recorrente (mensal ou anual), separadamente do que você paga aos provedores de IA. Os valores
                exibidos no site são <strong>provisórios</strong> até a confirmação comercial; o preço final é mostrado antes de qualquer cobrança.
              </p>
              <p>
                Você pode cancelar a qualquer momento; o acesso segue até o fim do período pago. Regras de reembolso, upgrade e downgrade serão
                detalhadas na versão final destes termos.
              </p>
            </>
          ),
        },
        {
          id: "garantia",
          title: "Economy Guarantee",
          body: (
            <>
              <p>
                A Economy Guarantee é condicionada a: baseline real medido em modo observação, volume mínimo elegível, qualidade mantida segundo o
                Quality Guard e janela de avaliação definida. A redução de 30% a 60% é uma <strong>meta</strong> para cargas qualificadas, não um
                resultado garantido para qualquer uso.
              </p>
              <p>
                Volume mínimo, duração da janela e contrapartida em caso de não atingimento serão definidos no contrato de cada plano. Descontos
                nativos do provedor já presentes no baseline não contam como economia.
              </p>
            </>
          ),
        },
        {
          id: "qualidade",
          title: "Qualidade e disponibilidade",
          body: (
            <p>
              O gateway opera em modo fail-open: se a otimização falhar, a requisição original segue sem alteração. Você pode pausar toda otimização a
              qualquer momento. Ainda assim, o serviço é fornecido sem garantia de disponibilidade ininterrupta até a publicação de um acordo de
              nível de serviço (SLA).
            </p>
          ),
        },
        {
          id: "responsabilidade",
          title: "Limitação de responsabilidade",
          body: (
            <p>
              Na extensão permitida pela lei, a responsabilidade da maindy. fica limitada ao valor pago pela assinatura nos 12 meses anteriores ao
              evento. Não respondemos por cobranças do provedor de IA decorrentes do seu uso, nem por decisões tomadas com base em estimativas
              identificadas como tal.
            </p>
          ),
        },
        {
          id: "contato",
          title: "Lei aplicável e contato",
          body: (
            <p>
              Estes termos são regidos pelas leis brasileiras. Dúvidas: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> (endereço a
              confirmar).
            </p>
          ),
        },
      ]}
    />
  );
}
