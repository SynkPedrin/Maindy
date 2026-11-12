'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { forgotPasswordAction, resetPasswordAction } from '@/app/auth/actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { FormAlert } from './FormAlert';
import { forgotSchema, resetSchema } from '@/lib/validation';

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const r = await forgotPasswordAction(values);
      setMessage(r.ok ? { tone: 'success', text: r.message ?? '' } : { tone: 'error', text: r.error });
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
      <Input label="E-mail" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Enviar link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const r = await resetPasswordAction(values);
      if (!r.ok) return setError(r.error);
      window.location.assign(r.next ?? '/auth/continuar');
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      <Input
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        hint="Mínimo de 8 caracteres, com letras e números."
        error={errors.password?.message}
        {...register('password')}
      />
      <Input label="Confirme a nova senha" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Salvar e entrar
      </Button>
    </form>
  );
}
