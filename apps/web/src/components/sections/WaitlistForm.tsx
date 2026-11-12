'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Textarea } from '@/components/ui/Field';
import { FormAlert } from '@/components/auth/FormAlert';
import { waitlistSchema, type WaitlistInput } from '@/lib/validation';
import { ease } from '@/lib/animations';
import { track } from '@/lib/analytics';

const platforms = [
  { v: 'iphone', l: 'iPhone' },
  { v: 'android', l: 'Android' },
  { v: 'ambas', l: 'Ambas' },
] as const;

export function WaitlistForm() {
  const [status, setStatus] = useState<'idle' | 'created' | 'duplicate'>('idle');
  const [serverError, setServerError] = useState<string>();
  const started = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WaitlistInput>({ resolver: zodResolver(waitlistSchema), mode: 'onTouched' });

  const onStart = () => {
    if (started.current) return;
    started.current = true;
    track('waitlist_form_start');
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(undefined);
    track('waitlist_form_submit', { platform: values.platform });
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (res.ok && (data.status === 'created' || data.status === 'duplicate')) {
        setStatus(data.status);
        track('waitlist_form_success', { duplicate: data.status === 'duplicate' });
        return;
      }
      setServerError(data.error ?? 'Não foi possível concluir sua inscrição. Tente novamente.');
    } catch {
      setServerError('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
    }
  });

  return (
    <AnimatePresence mode="wait">
      {status !== 'idle' ? (
        <motion.div key="ok" initial={{ opacity: 0, scale: 0.95, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 0.7, ease: ease.out }} className="flex flex-col items-center py-10 text-center" role="status">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.15 }} className="flex size-16 items-center justify-center rounded-full bg-electric shadow-[0_0_50px_rgb(161_0_255/0.7)]">
            <svg viewBox="0 0 24 24" className="size-8" aria-hidden>
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 0.5 }} />
            </svg>
          </motion.span>
          <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight">
            {status === 'created' ? 'Você está na lista.' : 'Você já estava na lista.'}
          </h3>
          <p className="mt-2 max-w-sm text-[15px] text-muted">
            {status === 'created' ? 'Vamos avisar por e-mail quando a MAINDY estiver pronta para você. Obrigado por acompanhar desde o começo.' : 'Seu e-mail já estava inscrito. Fique tranquilo: você será avisado.'}
          </p>
          <p className="mt-6 text-sm text-muted">
            Quer garantir seu acesso?{' '}
            <Link href="/cadastro" className="font-medium text-white underline underline-offset-4">
              Crie sua conta
            </Link>
          </p>
        </motion.div>
      ) : (
        <motion.form key="form" exit={{ opacity: 0, y: -10 }} onSubmit={onSubmit} onFocus={onStart} noValidate className="flex flex-col gap-5">
          {serverError && <FormAlert>{serverError}</FormAlert>}
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="Nome" autoComplete="name" error={errors.name?.message} {...register('name')} />
            <Input label="E-mail" type="email" inputMode="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-white/90">Plataforma principal</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {platforms.map((p) => (
                <label key={p.v} className="cursor-pointer">
                  <input type="radio" value={p.v} className="peer sr-only" {...register('platform')} />
                  <span className="flex h-12 items-center justify-center rounded-2xl border border-line text-sm text-muted transition-all hover:border-white/25 peer-checked:border-electric peer-checked:bg-electric/15 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow">
                    {p.l}
                  </span>
                </label>
              ))}
            </div>
            {errors.platform && (
              <p role="alert" className="mt-1.5 text-[13px] text-danger">
                {errors.platform.message}
              </p>
            )}
          </fieldset>

          <Textarea label="O que você mais gostaria que a MAINDY lembrasse por você?" optional rows={3} maxLength={500} error={errors.mainExpectation?.message} {...register('mainExpectation')} />

          {/* honeypot anti-bot: invisível para pessoas */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Empresa
              <input tabIndex={-1} autoComplete="off" {...register('company')} />
            </label>
          </div>

          <Checkbox error={errors.consent?.message} {...register('consent')}>
            Concordo com a{' '}
            <Link href="/privacidade" target="_blank" className="text-white underline decoration-white/30 underline-offset-2">
              Política de Privacidade
            </Link>{' '}
            e autorizo o uso do meu nome e e-mail para receber novidades sobre a MAINDY. Posso sair da lista quando quiser.
          </Checkbox>

          <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
            Quero entrar na lista
          </Button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
