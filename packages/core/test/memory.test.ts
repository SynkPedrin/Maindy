import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../src/memory/intent.js';
import { extractMemoryLocal, extractPeople, reminderSubject, taskSubject } from '../src/memory/extract.js';

describe('intent classification (pt-BR)', () => {
  const cases: Array<[string, string]> = [
    ['Minha mãe prefere que eu ligue depois das 18h.', 'save_memory'],
    ['Qual o melhor horário para ligar para minha mãe?', 'recall'],
    ['Eu tranquei a porta?', 'physical_check'],
    ['Será que eu desliguei o fogão?', 'physical_check'],
    ['Me lembra de tomar água daqui a 20 minutos', 'create_reminder'],
    ['Preciso entregar o relatório na sexta', 'create_task'],
    ['O que eu tenho pra fazer hoje?', 'tasks_query'],
    ['Qual minha agenda amanhã?', 'calendar_query'],
    ['Marca uma reunião com a Ana sexta às 15h', 'calendar_create'],
    ['Escreve um e-mail para o João sobre o orçamento', 'draft_email'],
    ['Ativa o modo foco por 50 minutos', 'focus'],
    ['Apaga a memória sobre o estacionamento', 'delete_memory'],
    ['Oi, tudo bem?', 'smalltalk'],
    ['Bom dia', 'smalltalk'],
    ['Estacionei no piso G2 vaga 41', 'save_memory'],
    ['Onde eu estacionei o carro?', 'recall'],
  ];
  it.each(cases)('%s → %s', (text, intent) => {
    expect(classifyIntent(text).intent).toBe(intent);
  });
});

describe('memory extraction', () => {
  it('extracts the person and preference from the canonical example', () => {
    const m = extractMemoryLocal('Minha mãe prefere que eu ligue depois das 18h.');
    expect(m.people).toEqual([{ name: 'Mãe', relation: 'mãe' }]);
    expect(m.type).toBe('people');
    expect(m.category).toBe('people');
    expect(m.content).toBe('Minha mãe prefere que eu ligue depois das 18h.');
    expect(m.provenance).toBe('user_confirmed');
    expect(m.tags).toContain('mãe');
  });

  it('strips capture prefixes and finds proper names', () => {
    const m = extractMemoryLocal('Anota que a Ana disse que a reunião foi para sexta às 15h');
    expect(m.content).toBe('A Ana disse que a reunião foi para sexta às 15h.');
    expect(m.people.map((p) => p.name)).toContain('Ana');
    expect(m.category).toBe('work');
  });

  it('recognises commitments, habits and semantic facts', () => {
    expect(extractMemoryLocal('Prometi devolver o livro do Carlos até domingo').type).toBe('commitment');
    expect(extractMemoryLocal('Eu sempre tomo café sem açúcar').type).toBe('habit');
    expect(extractMemoryLocal('O código do portão é 4721').type).toBe('semantic');
    expect(extractMemoryLocal('Estacionei no piso G2 vaga 41').type).toBe('episodic');
  });

  it('does not treat sentence-initial words as names', () => {
    expect(extractPeople('Preciso comprar pão').length).toBe(0);
    expect(extractPeople('Ana Paula mandou o contrato').map((p) => p.name)).toEqual(['Ana Paula']);
  });

  it('extracts reminder and task subjects', () => {
    expect(reminderSubject('Me lembra de tomar água daqui a 20 minutos', 'daqui a 20 minutos')).toBe('Tomar água');
    expect(reminderSubject('me lembra de ligar pro médico amanhã às 9h', 'amanhã às 9h')).toBe('Ligar pro médico');
    expect(taskSubject('Preciso entregar o relatório')).toBe('Entregar o relatório');
  });
});

describe('addressing the assistant by name', () => {
  it('strips the custom name and keeps the request', async () => {
    const { stripAssistantAddress } = await import('../src/memory/intent.js');
    expect(stripAssistantAddress('Nico, guarda essas informações: trabalho com marketing digital', ['Nico'])).toBe('Guarda essas informações: trabalho com marketing digital');
    expect(stripAssistantAddress('Ei Nico me lembra de ligar pro João às 18h', ['Nico'])).toBe('Me lembra de ligar pro João às 18h');
    expect(stripAssistantAddress('Nicolau chegou', ['Nico'])).toBe('Nicolau chegou');
    expect(stripAssistantAddress('Olá Mãindy! anota isso', ['MAINDY'])).toBe('Anota isso');
  });
  it('extracts the content after "guarda essas informações"', () => {
    expect(extractMemoryLocal('Guarda essas informações: trabalho com marketing digital').content).toBe('Trabalho com marketing digital.');
    expect(classifyIntent('Me lembra de ligar pro João às 18h').intent).toBe('create_reminder');
  });
});
