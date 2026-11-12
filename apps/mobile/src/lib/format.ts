export function greeting(date: Date, timeZone: string): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(date));
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function longDate(date: Date, timeZone: string): string {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function time(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function relativeDay(iso: string, timeZone: string, now = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = fmt.format(new Date(iso));
  const today = fmt.format(now);
  const tomorrow = fmt.format(new Date(now.getTime() + 86_400_000));
  const yesterday = fmt.format(new Date(now.getTime() - 86_400_000));
  if (d === today) return 'Hoje';
  if (d === tomorrow) return 'Amanhã';
  if (d === yesterday) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { timeZone, day: 'numeric', month: 'short' }).format(new Date(iso));
}

export function whenLabel(iso: string, timeZone: string): string {
  return `${relativeDay(iso, timeZone)}, ${time(iso, timeZone)}`;
}

export const PROVENANCE_LABEL: Record<string, string> = {
  user_confirmed: 'Você confirmou',
  ai_inferred: 'Inferido pela MAINDY',
  external: 'De uma integração',
  unverified: 'Não verificado',
};

export const SOURCE_LABEL: Record<string, string> = {
  voice: 'por voz',
  text: 'por texto',
  agent: 'na conversa',
  import: 'importado',
  integration: 'integração',
  vault: 'no Obsidian',
};

export const CATEGORY_LABEL: Record<string, string> = {
  people: 'Pessoas',
  personal: 'Pessoal',
  work: 'Trabalho',
  study: 'Estudos',
  health: 'Saúde',
  finance: 'Finanças',
  routines: 'Rotinas',
  important: 'Importante',
};

export const FOCUS_LABEL: Record<string, string> = { off: 'Desligado', work: 'Trabalho', study: 'Estudo', rest: 'Descanso', sleep: 'Sono', driving: 'Direção' };
