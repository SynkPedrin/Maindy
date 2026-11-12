import { describe, expect, it } from 'vitest';
import { greeting, relativeDay, whenLabel } from '../src/lib/format';

describe('pt-BR formatting', () => {
  const now = new Date('2026-11-12T13:30:00Z'); // 10:30 em São Paulo
  it('greets by local time', () => {
    expect(greeting(now, 'America/Sao_Paulo')).toBe('Bom dia');
    expect(greeting(new Date('2026-11-12T22:00:00Z'), 'America/Sao_Paulo')).toBe('Boa noite');
  });
  it('labels relative days in the user timezone', () => {
    expect(relativeDay('2026-11-13T12:00:00Z', 'America/Sao_Paulo', now)).toBe('Amanhã');
    expect(relativeDay('2026-11-12T02:00:00Z', 'America/Sao_Paulo', now)).toBe('Ontem');
    expect(whenLabel('2026-11-12T21:00:00Z', 'America/Sao_Paulo').endsWith('18:00')).toBe(true);
  });
});
