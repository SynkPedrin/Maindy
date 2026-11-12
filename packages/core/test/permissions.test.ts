import { describe, expect, it } from 'vitest';
import { AutonomyLevel } from '../src/contracts/index.js';
import { evaluatePermission, validateGrantRequest, type PermissionGrant } from '../src/permissions/engine.js';

const g = (p: Partial<PermissionGrant>): PermissionGrant => ({
  id: p.id ?? 'g1',
  capability: p.capability ?? 'calendar.create',
  integration: p.integration ?? null,
  mode: p.mode ?? 'auto',
  expiresAt: p.expiresAt ?? null,
  revokedAt: p.revokedAt ?? null,
  createdAt: p.createdAt ?? '2026-11-01T00:00:00Z',
});
const base = { grants: [], connectedIntegrations: [], autoSaveMemories: true, now: new Date('2026-11-12T12:00:00Z') };

describe('Permission Engine', () => {
  it('applies default policies by level', () => {
    expect(evaluatePermission('memory.search', base)).toMatchObject({ mode: 'auto', level: AutonomyLevel.Read });
    expect(evaluatePermission('memory.save', base)).toMatchObject({ mode: 'auto', level: AutonomyLevel.Organize });
    expect(evaluatePermission('reminder.create', base).mode).toBe('auto');
    expect(evaluatePermission('calendar.create', base).mode).toBe('confirm');
    expect(evaluatePermission('memory.delete', base)).toMatchObject({ mode: 'confirm', level: AutonomyLevel.Sensitive });
  });

  it('memory.save asks for confirmation when auto-save is off', () => {
    expect(evaluatePermission('memory.save', { ...base, autoSaveMemories: false }).mode).toBe('confirm');
  });

  it('integration capabilities are denied until the integration is connected', () => {
    expect(evaluatePermission('email.draft', base)).toMatchObject({ mode: 'deny', reason: 'integration_not_connected:gmail' });
    expect(evaluatePermission('email.draft', { ...base, connectedIntegrations: ['gmail'] }).mode).toBe('auto');
    expect(evaluatePermission('email.send', { ...base, connectedIntegrations: ['gmail'] }).mode).toBe('confirm');
  });

  it('user grants override defaults, newest wins, revoked/expired are ignored', () => {
    expect(evaluatePermission('calendar.create', { ...base, grants: [g({ mode: 'auto' })] }).mode).toBe('auto');
    expect(evaluatePermission('calendar.create', { ...base, grants: [g({ mode: 'auto', revokedAt: '2026-11-02T00:00:00Z' })] }).mode).toBe('confirm');
    expect(evaluatePermission('calendar.create', { ...base, grants: [g({ mode: 'auto', expiresAt: '2026-11-10T00:00:00Z' })] }).mode).toBe('confirm');
    const grants = [g({ id: 'old', mode: 'auto', createdAt: '2026-11-01T00:00:00Z' }), g({ id: 'new', mode: 'deny', createdAt: '2026-11-05T00:00:00Z' })];
    expect(evaluatePermission('calendar.create', { ...base, grants })).toMatchObject({ mode: 'deny', grantId: 'new' });
  });

  it('sensitive actions always require confirmation, even with an auto grant', () => {
    expect(evaluatePermission('memory.delete', { ...base, grants: [g({ capability: 'memory.delete', mode: 'auto' })] }).mode).toBe('confirm');
    expect(() => validateGrantRequest({ capability: 'data.delete', mode: 'auto' })).toThrow();
    expect(() => validateGrantRequest({ capability: 'email.send', mode: 'auto' })).not.toThrow();
  });

  it('rejects unknown capabilities', () => {
    expect(() => evaluatePermission('shell.exec', base)).toThrow();
  });
});
