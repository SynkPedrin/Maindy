'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginAction } from '@/app/auth/actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { FormAlert } from './FormAlert';
import { Divider, SocialButtons } from './SocialButtons';
import { loginSchema, type LoginInput } from '@/lib/validation';
import { track } from '@/lib/analytics';

export function LoginForm({ providers, initialError }: { providers: { google: boolean; github: boolean }; initialError?: string }) {
  const [serverError, setServerError] = useState(initialError);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await loginAction(values);
      if (!result.ok) return setServerError(result.error);
      track('auth_login', { method: 'email' });
      window.location.assign(result.next ?? '/auth/continuar');
    });
  });

  return (
    <div>
      <SocialButtons intent="login" enabled={providers} />
      <Divider>ou com e-mail</Divider>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Input label="E-mail" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <Input label="Senha" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <div className="-mt-1 text-right">
          <Link href="/recuperar-senha" className="text-[13px] text-muted transition-colors hover:text-white">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
          Entrar
        </Button>
      </form>
    </div>
  );
}
