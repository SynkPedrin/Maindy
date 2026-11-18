"use client";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { z } from "zod";
import {
  ConnectorDto,
  DeviceDto,
  MeDto,
  OnboardingDto,
  OrbitPolicyDto,
  PlanDto,
  QuotaSnapshot,
  ReleaseDto,
  SavingsSummary,
  SessionDto,
  SubscriptionDto,
  type BillingInterval,
  type ConnectorKind,
  type ConnectorStatus,
  type OnboardingStep,
  type OrbitMode,
  type PlanCode,
  type TechniqueName,
} from "@maindy/contracts";
import { api, apiVoid } from "./client";
import {
  AgentsResponse,
  AuditResponse,
  CheckoutResponse,
  InvoicesResponse,
  PairDetails,
  ProjectsResponse,
  QualityEvaluationsResponse,
  RunsResponse,
  TimeseriesResponse,
  listOf,
  type RunDto,
} from "./schemas";
import { resolvePeriod, type ResolvedPeriod } from "./period";

/** Body accepted by PUT /v1/orbit/policy (apps/api PolicyUpdateRequest). */
export interface PolicyUpdateRequest {
  mode?: OrbitMode;
  techniques?: { name: TechniqueName; enabled: boolean }[];
  qualitySampleRate?: number;
  maxAddedLatencyMs?: number;
  cacheTtlSeconds?: number;
  expectedVersion?: number;
}

export const qk = {
  me: ["me"] as const,
  summary: (from: string, to: string) => ["stats", "summary", from, to] as const,
  timeseries: (from: string, to: string, bucket: string) => ["stats", "timeseries", from, to, bucket] as const,
  runs: (limit: number) => ["runs", limit] as const,
  connectors: ["connectors"] as const,
  policy: ["orbit", "policy"] as const,
  projects: ["projects"] as const,
  agents: ["agents"] as const,
  limits: ["limits"] as const,
  sessions: ["sessions"] as const,
  devices: ["devices"] as const,
  quality: ["quality"] as const,
  plans: ["plans"] as const,
  subscription: ["billing", "subscription"] as const,
  invoices: ["billing", "invoices"] as const,
  onboarding: ["onboarding"] as const,
  releases: ["releases"] as const,
  audit: ["audit"] as const,
  pair: (code: string) => ["pair", code] as const,
};

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">;

/** Period from URL — stable per (periodo,de,ate) so query keys don't churn every render. */
export function usePeriod(): ResolvedPeriod {
  const sp = useSearchParams();
  const periodo = sp.get("periodo");
  const de = sp.get("de");
  const ate = sp.get("ate");
  return useMemo(
    () => resolvePeriod({ get: (k) => (k === "periodo" ? periodo : k === "de" ? de : k === "ate" ? ate : null) }),
    [periodo, de, ate],
  );
}

export const useMe = (opts?: Opts<MeDto>) => useQuery({ queryKey: qk.me, queryFn: () => api("/v1/me", MeDto), ...opts });

export function useSummary(p: ResolvedPeriod) {
  return useQuery({
    queryKey: qk.summary(p.from, p.to),
    queryFn: () => api(`/v1/stats/summary?from=${encodeURIComponent(p.from)}&to=${encodeURIComponent(p.to)}`, SavingsSummary),
  });
}

export function useTimeseries(p: ResolvedPeriod) {
  return useQuery({
    queryKey: qk.timeseries(p.from, p.to, p.bucket),
    queryFn: () =>
      api(
        `/v1/stats/timeseries?from=${encodeURIComponent(p.from)}&to=${encodeURIComponent(p.to)}&bucket=${p.bucket}`,
        TimeseriesResponse,
      ).then((r) => r.items),
  });
}

export const useRuns = (limit = 20) =>
  useQuery({ queryKey: qk.runs(limit), queryFn: () => api(`/v1/runs?limit=${limit}`, RunsResponse) });

export const useConnectors = () =>
  useQuery({ queryKey: qk.connectors, queryFn: () => api("/v1/connectors", listOf(ConnectorDto, ["items", "connectors"])).then((r) => r.items) });

export const usePolicy = () => useQuery({ queryKey: qk.policy, queryFn: () => api("/v1/orbit/policy", OrbitPolicyDto) });

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api("/v1/projects", ProjectsResponse).then((r) => r.items) });
export const useAgents = () => useQuery({ queryKey: qk.agents, queryFn: () => api("/v1/agents", AgentsResponse).then((r) => r.items) });

export const useLimits = () =>
  useQuery({ queryKey: qk.limits, queryFn: () => api("/v1/limits", listOf(QuotaSnapshot, ["items", "snapshots", "limits"])).then((r) => r.items) });

export const useSessions = () =>
  useQuery({ queryKey: qk.sessions, queryFn: () => api("/v1/auth/sessions", listOf(SessionDto, ["items", "sessions"])).then((r) => r.items) });

export const useDevices = () =>
  useQuery({ queryKey: qk.devices, queryFn: () => api("/v1/devices", listOf(DeviceDto, ["items", "devices"])).then((r) => r.items) });

export const useQualityEvaluations = (p: ResolvedPeriod) =>
  useQuery({
    queryKey: [...qk.quality, p.from, p.to],
    queryFn: () =>
      api(`/v1/quality/evaluations?from=${encodeURIComponent(p.from)}&to=${encodeURIComponent(p.to)}&limit=200`, QualityEvaluationsResponse).then((r) => r.items),
  });

/** Pages through /v1/runs (newest first) until events fall before the period start. */
export function useRunsInPeriod(p: ResolvedPeriod, maxPages = 5) {
  return useQuery({
    queryKey: ["runs-period", p.from, p.to, maxPages],
    queryFn: async () => {
      const out: RunDto[] = [];
      let cursor: string | null = null;
      let truncated = false;
      for (let page = 0; page < maxPages; page++) {
        const r: { items: RunDto[]; nextCursor: string | null } = await api(`/v1/runs?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, RunsResponse);
        const inRange = r.items.filter((e) => e.occurredAt >= p.from && e.occurredAt <= p.to);
        out.push(...inRange);
        const reachedStart = r.items.some((e) => e.occurredAt < p.from);
        cursor = r.nextCursor;
        if (reachedStart || !cursor) break;
        if (page === maxPages - 1) truncated = true;
      }
      return { items: out, truncated };
    },
  });
}

export const usePlans = () => useQuery({ queryKey: qk.plans, queryFn: () => api("/v1/plans", listOf(PlanDto, ["items", "plans"])).then((r) => r.items) });

export const useSubscription = () =>
  useQuery({ queryKey: qk.subscription, queryFn: () => api("/v1/billing/subscription", SubscriptionDto.nullable()) });

export const useInvoices = () =>
  useQuery({ queryKey: qk.invoices, queryFn: () => api("/v1/billing/invoices", InvoicesResponse).then((r) => r.items) });

export const useOnboarding = () => useQuery({ queryKey: qk.onboarding, queryFn: () => api("/v1/onboarding", OnboardingDto) });

export const useReleases = () =>
  useQuery({ queryKey: qk.releases, queryFn: () => api("/v1/releases", listOf(ReleaseDto, ["items", "releases"])).then((r) => r.items) });

export const useAudit = (enabled = true) =>
  useQuery({ queryKey: qk.audit, queryFn: () => api("/v1/audit", AuditResponse).then((r) => r.items), enabled, retry: false });

export const usePairDetails = (code: string | null) =>
  useQuery({
    queryKey: qk.pair(code ?? ""),
    queryFn: () => api(`/v1/devices/pair/${encodeURIComponent(code ?? "")}`, PairDetails),
    enabled: !!code,
    retry: false,
  });

/* ---------------- mutations ---------------- */

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { complete?: OnboardingStep[]; dismissed?: boolean }) =>
      api("/v1/onboarding", OnboardingDto, { method: "PATCH", body }),
    onSuccess: (data) => {
      qc.setQueryData(qk.onboarding, data);
      qc.setQueryData<MeDto | undefined>(qk.me, (me) => (me ? { ...me, onboarding: data } : me));
    },
  });
}

export function useSavePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PolicyUpdateRequest) => api("/v1/orbit/policy", OrbitPolicyDto, { method: "PUT", body }),
    onSuccess: (data) => qc.setQueryData(qk.policy, data),
  });
}

export function usePauseOrbit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pause: boolean) => api(pause ? "/v1/orbit/pause" : "/v1/orbit/resume", OrbitPolicyDto, { method: "POST", body: {} }),
    onSuccess: (data) => qc.setQueryData(qk.policy, data),
  });
}

export function useRollback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { technique: TechniqueName; reason: string }) => api("/v1/orbit/rollback", OrbitPolicyDto, { method: "POST", body }),
    onSuccess: (data) => qc.setQueryData(qk.policy, data),
  });
}

export function useUpdateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, status, credentialRef }: { kind: ConnectorKind; status: ConnectorStatus; credentialRef?: string | null }) =>
      api(`/v1/connectors/${kind}`, z.unknown(), { method: "PUT", body: { status, ...(credentialRef ? { credentialRef } : {}) } }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.connectors }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; key: string; description?: string | null }) => api("/v1/projects", z.unknown(), { method: "POST", body }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiVoid(`/v1/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}
export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; key: string; projectId?: string | null; description?: string | null }) =>
      api("/v1/agents", z.unknown(), { method: "POST", body }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.agents }),
  });
}
export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiVoid(`/v1/agents/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.agents }),
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiVoid(`/v1/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.sessions }),
  });
}
export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiVoid("/v1/auth/sessions/revoke-others", { method: "POST", body: {} }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.sessions }),
  });
}
export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiVoid(`/v1/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.devices });
      qc.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (body: { planCode: PlanCode; interval: BillingInterval }) =>
      api("/v1/billing/checkout", CheckoutResponse, { method: "POST", body }),
  });
}
export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiVoid("/v1/billing/cancel", { method: "POST", body: {} }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.subscription });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}
export function usePortal() {
  return useMutation({ mutationFn: () => api("/v1/billing/portal", CheckoutResponse, { method: "POST", body: {} }) });
}

export function useApprovePairing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { userCode: string; approve: boolean }) => apiVoid("/v1/devices/pair/approve", { method: "POST", body }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.devices }),
  });
}
