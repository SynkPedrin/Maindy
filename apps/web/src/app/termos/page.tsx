import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/layout/LegalPage';
import { POLICY_VERSION } from '@/lib/env';

export const metadata: Metadata = { title: 'Termos de Uso', description: 'Termos de uso da MAINDY.' };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" version={POLICY_VERSION}>
      <p>
        Ao criar uma conta na MAINDY você concorda com estes termos. A MAINDY está em desenvolvimento e em acesso
        antecipado: recursos podem mudar, ficar indisponíveis temporariamente ou ainda não estar completos.
      </p>

      <h2>1. O serviço</h2>
      <p>
        A MAINDY é uma assistente pessoal com inteligência artificial que ajuda a registrar, organizar e recuperar
        informações do seu dia a dia. Ela não é um serviço médico, psicológico ou terapêutico e não substitui
        orientação profissional.
      </p>

      <h2>2. Sua conta</h2>
      <ul>
        <li>Você é responsável por manter sua senha em segurança e pelas atividades na sua conta.</li>
        <li>Forneça informações verdadeiras no cadastro.</li>
        <li>É preciso ter pelo menos 18 anos, ou autorização de quem for responsável legal.</li>
      </ul>

      <h2>3. Uso adequado</h2>
      <p>
        Não use a MAINDY para atividades ilegais, para armazenar conteúdo de terceiros sem autorização ou para tentar
        acessar dados de outras pessoas.
      </p>

      <h2>4. Respostas da inteligência artificial</h2>
      <p>
        A MAINDY pode cometer erros. Confira informações importantes, como datas, compromissos e dados financeiros,
        antes de tomar decisões com base nelas.
      </p>

      <h2>5. Seus dados</h2>
      <p>
        O conteúdo que você registra é seu. O tratamento dos seus dados segue a{' '}
        <Link href="/privacidade" className="text-white underline underline-offset-2">
          Política de Privacidade
        </Link>
        .
      </p>

      <h2>6. Encerramento</h2>
      <p>Você pode encerrar sua conta quando quiser. Podemos suspender contas que violem estes termos.</p>

      <h2>7. Alterações</h2>
      <p>
        Podemos atualizar estes termos. Mudanças relevantes serão comunicadas e, quando necessário, pediremos um novo
        aceite.
      </p>
    </LegalPage>
  );
}
