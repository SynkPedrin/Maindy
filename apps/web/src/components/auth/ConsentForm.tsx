'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { consentAction } from '@/app/auth/actions';
import { Button } from '@/components/ui/Button';
import { ConsentFields } from './ConsentFields';
import { FormAlert } from './FormAlert';
import { consentSchema, type ConsentInput } from '@/lib/validation';

export function ConsentForm({ tipo }: { tipo: 'login' | 'signup' }) {
  const [serverError, setServerError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConsentInput>({ resolver: zodResolver(consentSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await consentAction(values, tipo);
      if (!result.ok) return setServerError(result.error);
      window.location.assign(result.next ?? '/auth/continuar');
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError && <FormAlert>{serverError}</FormAlert>}
      <ConsentFields register={register} errors={errors} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Concordo e quero continuar
      </Button>
    </form>
  );
}
