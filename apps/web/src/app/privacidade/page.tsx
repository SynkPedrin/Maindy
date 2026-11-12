import type { Metadata } from 'next';
import { LegalPage } from '@/components/layout/LegalPage';
import { POLICY_VERSION } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como a MAINDY trata seus dados pessoais, em conformidade com a LGPD.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" version={POLICY_VERSION}>
      <p>
        Esta política explica quais dados pessoais a MAINDY trata, para quê, com qual base legal e quais são os seus
        direitos, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018, “LGPD”). A MAINDY está em
        desenvolvimento; este texto será revisado antes do lançamento público e você será avisado sobre mudanças
        relevantes.
      </p>

      <h2>1. Quais dados tratamos</h2>
      <ul>
        <li><strong>Lista de acesso antecipado:</strong> nome, e-mail, plataforma principal e, se você quiser, o que gostaria que a MAINDY lembrasse por você.</li>
        <li><strong>Conta:</strong> nome, e-mail e senha (guardada apenas como hash criptográfico pelo provedor de autenticação). Se você entrar com Google ou GitHub, recebemos nome, e-mail e foto do perfil fornecidos por esses serviços.</li>
        <li><strong>Uso do produto:</strong> as informações que você registra na MAINDY por texto ou voz, seus lembretes, tarefas e configurações do agente.</li>
        <li><strong>Registros técnicos:</strong> data e hora de acesso e endereço IP, para segurança e prevenção de abuso.</li>
      </ul>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Criar e proteger sua conta e permitir o seu acesso.</li>
        <li>Organizar, guardar e recuperar as informações que você registra, inclusive com processamento por inteligência artificial.</li>
        <li>Avisar sobre o lançamento e novidades, no caso da lista de acesso antecipado.</li>
        <li>Prevenir fraudes e cumprir obrigações legais.</li>
      </ul>

      <h2>3. Bases legais</h2>
      <p>
        Tratamos seus dados com base no seu <strong>consentimento</strong> (art. 7º, I), na <strong>execução do
        contrato</strong> de uso do serviço (art. 7º, V), no <strong>cumprimento de obrigação legal</strong> (art. 7º,
        II) e no <strong>legítimo interesse</strong> para segurança do serviço (art. 7º, IX). O consentimento para
        processamento por IA é pedido de forma separada e pode ser revogado a qualquer momento.
      </p>

      <h2>4. Processamento por inteligência artificial</h2>
      <p>
        Para funcionar, a MAINDY envia o conteúdo que você registra a provedores de modelos de IA contratados, apenas
        para gerar respostas e organizar suas memórias. A arquitetura separa os dados de cada usuário e o acesso é
        controlado por permissões. Não vendemos seus dados.
      </p>

      <h2>5. Compartilhamento</h2>
      <p>
        Compartilhamos dados apenas com operadores necessários ao serviço (hospedagem, banco de dados, autenticação e
        provedores de IA), sob obrigações de confidencialidade, ou quando exigido por lei. Alguns desses fornecedores
        podem processar dados fora do Brasil, observando o art. 33 da LGPD.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <p>
        Mantemos os dados enquanto sua conta estiver ativa ou enquanto você estiver na lista de acesso antecipado.
        Ao excluir a conta ou pedir a remoção, apagamos ou anonimizamos os dados, salvo quando a lei exigir a guarda.
      </p>

      <h2>7. Seus direitos</h2>
      <p>Você pode, a qualquer momento (art. 18 da LGPD):</p>
      <ul>
        <li>confirmar se tratamos seus dados e acessá-los;</li>
        <li>corrigir dados incompletos ou desatualizados;</li>
        <li>pedir anonimização, bloqueio ou eliminação;</li>
        <li>pedir a portabilidade;</li>
        <li>revogar o consentimento e saber as consequências disso;</li>
        <li>saber com quem compartilhamos seus dados.</li>
      </ul>

      <h2>8. Contato</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas, fale com o encarregado pelo tratamento de dados pelo canal que será
        informado aqui antes do lançamento público.
      </p>
    </LegalPage>
  );
}
