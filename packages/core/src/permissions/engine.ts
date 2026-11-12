import { AutonomyLevel, type PermissionMode } from '../contracts/index.js';

/**
 * Permission Engine.
 *
 * Every agent action is mapped to a capability with a fixed autonomy level.
 * The engine combines the capability's default policy with the user's own grants
 * (per user, per integration, per capability, revocable, optionally time-limited).
 * The agent never creates grants: grants only come from authenticated user actions.
 */

export interface CapabilityPolicy {
  capability: string;
  level: AutonomyLevel;
  defaultMode: PermissionMode;
  /** integration that must be connected for the capability to run at all */
  integration?: string;
  /** human description (pt-BR) for the permissions screen */
  description: string;
}

export const CAPABILITIES: Record<string, CapabilityPolicy> = {
  'memory.search': { capability: 'memory.search', level: AutonomyLevel.Read, defaultMode: 'auto', description: 'Consultar suas memórias' },
  'tasks.read': { capability: 'tasks.read', level: AutonomyLevel.Read, defaultMode: 'auto', description: 'Consultar tarefas e lembretes' },
  'calendar.read': { capability: 'calendar.read', level: AutonomyLevel.Read, defaultMode: 'auto', description: 'Consultar sua agenda' },
  'memory.save': { capability: 'memory.save', level: AutonomyLevel.Organize, defaultMode: 'auto', description: 'Salvar memórias' },
  'task.create': { capability: 'task.create', level: AutonomyLevel.Organize, defaultMode: 'auto', description: 'Criar tarefas' },
  'reminder.create': { capability: 'reminder.create', level: AutonomyLevel.Organize, defaultMode: 'auto', description: 'Criar lembretes' },
  'task.complete': { capability: 'task.complete', level: AutonomyLevel.Reversible, defaultMode: 'auto', description: 'Concluir tarefas' },
  'focus.start': { capability: 'focus.start', level: AutonomyLevel.Reversible, defaultMode: 'auto', description: 'Ativar modos de foco' },
  'calendar.create': { capability: 'calendar.create', level: AutonomyLevel.Reversible, defaultMode: 'confirm', description: 'Criar eventos na agenda' },
  'email.draft': { capability: 'email.draft', level: AutonomyLevel.Reversible, defaultMode: 'auto', integration: 'gmail', description: 'Preparar rascunhos de e-mail' },
  'email.send': { capability: 'email.send', level: AutonomyLevel.External, defaultMode: 'confirm', integration: 'gmail', description: 'Enviar e-mails' },
  'sms.send': { capability: 'sms.send', level: AutonomyLevel.External, defaultMode: 'confirm', description: 'Enviar SMS' },
  'memory.delete': { capability: 'memory.delete', level: AutonomyLevel.Sensitive, defaultMode: 'confirm', description: 'Apagar memórias' },
  'calendar.delete': { capability: 'calendar.delete', level: AutonomyLevel.Sensitive, defaultMode: 'confirm', description: 'Apagar eventos' },
  'data.delete': { capability: 'data.delete', level: AutonomyLevel.Sensitive, defaultMode: 'confirm', description: 'Apagar dados pessoais' },
};

export interface PermissionGrant {
  id: string;
  capability: string;
  integration: string | null;
  mode: PermissionMode;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface PermissionContext {
  grants: PermissionGrant[];
  connectedIntegrations: string[];
  autoSaveMemories: boolean;
  now?: Date;
}

export interface PermissionDecision {
  capability: string;
  level: AutonomyLevel;
  mode: PermissionMode;
  reason: string;
  grantId: string | null;
}

export function getCapability(capability: string): CapabilityPolicy {
  const policy = CAPABILITIES[capability];
  if (!policy) throw new Error(`Unknown capability: ${capability}`);
  return policy;
}

export function isGrantActive(grant: PermissionGrant, now: Date): boolean {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

export function evaluatePermission(capability: string, ctx: PermissionContext): PermissionDecision {
  const policy = getCapability(capability);
  const now = ctx.now ?? new Date();
  const base = { capability, level: policy.level };

  if (policy.integration && !ctx.connectedIntegrations.includes(policy.integration)) {
    return { ...base, mode: 'deny', reason: `integration_not_connected:${policy.integration}`, grantId: null };
  }

  // newest active grant for this capability wins
  const grant = ctx.grants
    .filter((g) => g.capability === capability && isGrantActive(g, now))
    .filter((g) => !policy.integration || g.integration === null || g.integration === policy.integration)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (grant) {
    if (grant.mode === 'deny') return { ...base, mode: 'deny', reason: 'user_denied', grantId: grant.id };
    if (policy.level >= AutonomyLevel.Sensitive) {
      // sensitive / irreversible actions always require explicit confirmation
      return { ...base, mode: 'confirm', reason: 'sensitive_always_confirm', grantId: grant.id };
    }
    return { ...base, mode: grant.mode, reason: 'user_grant', grantId: grant.id };
  }

  if (capability === 'memory.save' && !ctx.autoSaveMemories) {
    return { ...base, mode: 'confirm', reason: 'auto_save_disabled', grantId: null };
  }
  return { ...base, mode: policy.defaultMode, reason: 'default_policy', grantId: null };
}

/** Validates a grant request coming from the app UI. Throws on invalid combinations. */
export function validateGrantRequest(input: { capability: string; mode: PermissionMode; expiresAt?: string | null }): void {
  const policy = getCapability(input.capability);
  if (policy.level >= AutonomyLevel.Sensitive && input.mode === 'auto') {
    throw new Error('Sensitive capabilities can never be set to automatic.');
  }
  if (input.expiresAt && Number.isNaN(Date.parse(input.expiresAt))) {
    throw new Error('expiresAt must be an ISO date');
  }
}
