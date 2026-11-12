import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Informe seu e-mail.')
  .max(254, 'E-mail muito longo.')
  .email('Digite um e-mail válido.');

const name = z
  .string()
  .trim()
  .min(2, 'Informe seu nome.')
  .max(120, 'Nome muito longo.');

export const PLATFORMS = ['iphone', 'android', 'ambas'] as const;

export const waitlistSchema = z.object({
  name,
  email,
  platform: z.enum(PLATFORMS, { message: 'Escolha sua plataforma principal.' }),
  mainExpectation: z.string().trim().max(500, 'Use até 500 caracteres.').optional().or(z.literal('')),
  consent: z.literal(true, { message: 'É preciso aceitar a Política de Privacidade.' }),
  // honeypot: humanos não preenchem
  company: z.string().max(0).optional().or(z.literal('')),
});
export type WaitlistInput = z.infer<typeof waitlistSchema>;

export const passwordSchema = z
  .string()
  .min(8, 'Use pelo menos 8 caracteres.')
  .max(72, 'Use no máximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra.')
  .regex(/[0-9]/, 'Inclua pelo menos um número.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe sua senha.').max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Consentimentos LGPD: termos e privacidade obrigatórios; tratamento por IA explícito e obrigatório para usar o produto. */
export const consentSchema = z.object({
  terms: z.literal(true, { message: 'É preciso aceitar os Termos de Uso.' }),
  privacy: z.literal(true, { message: 'É preciso aceitar a Política de Privacidade.' }),
  aiProcessing: z.literal(true, {
    message: 'A MAINDY precisa processar suas informações com IA para funcionar.',
  }),
});
export type ConsentInput = z.infer<typeof consentSchema>;

export const signupSchema = z
  .object({ name, email, password: passwordSchema })
  .and(consentSchema);
export type SignupInput = z.infer<typeof signupSchema>;

export const forgotSchema = z.object({ email });
export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'As senhas não conferem.', path: ['confirm'] });

/** Aceita apenas caminhos internos relativos para evitar open redirect. */
export function safeNextPath(value: string | null | undefined, fallback = '/auth/continuar'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}
