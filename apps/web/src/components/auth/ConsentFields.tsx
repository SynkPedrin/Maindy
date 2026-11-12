'use client';

import Link from 'next/link';
import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { Checkbox } from '@/components/ui/Field';

type ConsentShape = { terms: true; privacy: true; aiProcessing: true };

interface ConsentFieldsProps<T extends ConsentShape> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}

const link = 'text-white underline decoration-white/30 underline-offset-2 hover:decoration-white';

/** Consentimentos LGPD (art. 7º, I e art. 8º): livres, informados, destacados e separados por finalidade. */
export function ConsentFields<T extends ConsentShape>({ register, errors }: ConsentFieldsProps<T>) {
  const reg = register as unknown as UseFormRegister<ConsentShape>;
  const err = errors as FieldErrors<ConsentShape>;
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-line bg-white/[0.02] p-4">
      <legend className="px-1 text-[13px] font-medium text-white/90">Seus dados, suas escolhas</legend>
      <Checkbox {...reg('terms')} error={err.terms?.message}>
        Li e aceito os{' '}
        <Link href="/termos" target="_blank" className={link}>
          Termos de Uso
        </Link>
        .
      </Checkbox>
      <Checkbox {...reg('privacy')} error={err.privacy?.message}>
        Li a{' '}
        <Link href="/privacidade" target="_blank" className={link}>
          Política de Privacidade
        </Link>{' '}
        e concordo com o tratamento dos meus dados pessoais conforme a LGPD.
      </Checkbox>
      <Checkbox {...reg('aiProcessing')} error={err.aiProcessing?.message}>
        Autorizo a MAINDY a processar com inteligência artificial as informações que eu registrar, para organizar e
        recuperar minhas memórias. Posso revogar quando quiser.
      </Checkbox>
    </fieldset>
  );
}
