'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupAction } from '@/app/auth/actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ConsentFields } from './ConsentFields';
import { FormAlert } from './FormAlert';
import { Divider, SocialButtons } from './SocialButtons';
import { signupSchema, type SignupInput } from '@/lib/validation';
import { track } from '@/lib/analytics';

export function SignupForm({ providers, initialError }: { providers: { google: boolean; github: boolean }; initialError?: string }) {
  const [serverError, setServerError] = useState(initialError);
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema), mode: 'onTouched' });

  const consentGiven = Boolean(watch('terms') && watch('privacy') && watch('aiProcessing'));

  const onSubmit = handleSubmit((values) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await signupAction(values);
      if (!result.ok) return setServerError(result.error);
      track('auth_signup', { method: 'email' });
      if (result.next) return window.location.assign(result.next);
      setNotice(result.message);
    });
  });

  if (notice) {
    return (
      <FormAlert tone="success">
        <strong className="block text-white">Quase lá.</strong>
        {notice} Abra o link no mesmo navegador para entrar na MAINDY.
      </FormAlert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {serverError && <FormAlert>{serverError}</FormAlert>}
      <ConsentFields register={register} errors={errors} />

      <div>
        <SocialButtons intent="signup" enabled={providers} consentGiven={consentGiven} />
        {!consentGiven && (providers.google || providers.github) && (
          <p className="mt-2 text-[12.5px] text-muted">Marque as três opções acima para continuar com Google ou GitHub.</p>
        )}
      </div>

      <Divider>ou com e-mail</Divider>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input label="Nome" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <Input label="E-mail" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <Input
          label="Senha"
          type="password"
          autoComplete="new-password"
          hint="Mínimo de 8 caracteres, com letras e números."
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
          Criar minha conta
        </Button>
      </form>
    </div>
  );
}
