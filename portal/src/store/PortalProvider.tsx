import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ActivityEvent,
  AgentProfile,
  AgentSnapshot,
  BusinessProfile,
  ChatMessage,
  Lead,
  LeadWorkflow,
  NotificationSettings,
  PortalSettings,
  StatRange,
  StatSeries,
  SupportTicket,
  UserAccount,
  WalletState,
  WalletTransaction,
  WorkflowKind,
} from "@/types";
import { ACTIVITY, LEADS, SETTINGS_DEFAULT, STATS, USER, WALLET } from "@/data/mock";
import { WORKFLOW_BY_KIND } from "@/data/workflows";
import { uid } from "@/lib/format";
import { load, reset, save } from "./storage";

/**
 * FROZEN STORE CONTRACT (Wave 0).
 * Pages read state and call actions from here. Persistence is localStorage
 * today; replace the `storage.ts` boundary with API calls to go live.
 */

export interface PortalState {
  user: UserAccount;
  leads: Lead[];
  activity: ActivityEvent[];
  wallet: WalletState;
  settings: PortalSettings;
  tickets: SupportTicket[];
  /** Chat threads keyed by context ("global" or a lead id). */
  threads: Record<string, ChatMessage[]>;
}

export interface PortalActions {
  /* Leads & activity */
  getLead: (id: string) => Lead | undefined;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addLead: (lead: Lead) => void;
  logActivity: (event: Omit<ActivityEvent, "id" | "at"> & { at?: string }) => ActivityEvent;
  /** Starts a workflow: attaches a LeadWorkflow to the lead (if any) and logs activity. */
  startWorkflow: (kind: WorkflowKind, leadId?: string) => LeadWorkflow | null;
  /* Stats */
  getStats: (range: StatRange) => StatSeries[];
  /* Wallet */
  updateWallet: (patch: Partial<WalletState>) => void;
  addCredits: (amount: number, currency: "USD" | "USDC", description?: string) => void;
  addTransaction: (tx: Omit<WalletTransaction, "id" | "at">) => void;
  /* Settings */
  updateBusiness: (patch: Partial<BusinessProfile>) => void;
  updateNotifications: (patch: Partial<NotificationSettings>) => void;
  updateAgent: (patch: Partial<AgentProfile>) => void;
  /* Support */
  createTicket: (t: Omit<SupportTicket, "id" | "createdAt" | "status">) => SupportTicket;
  /* Chat */
  getThread: (key: string) => ChatMessage[];
  setThread: (key: string, messages: ChatMessage[]) => void;
  clearThread: (key: string) => void;
  /* Misc */
  snapshot: () => AgentSnapshot;
  resetDemo: () => void;
  signOut: () => void;
}

const StateCtx = createContext<PortalState | null>(null);
const ActionsCtx = createContext<PortalActions | null>(null);

const INITIAL: PortalState = {
  user: USER,
  leads: LEADS,
  activity: ACTIVITY,
  wallet: WALLET,
  settings: SETTINGS_DEFAULT,
  tickets: [],
  threads: {},
};

const VERSION = 2;

export function PortalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PortalState>(() => load(INITIAL, VERSION));
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const t = window.setTimeout(() => save(state, VERSION), 150);
    return () => window.clearTimeout(t);
  }, [state]);

  const patch = useCallback((fn: (s: PortalState) => PortalState) => setState((s) => fn(s)), []);

  const actions = useMemo<PortalActions>(() => {
    const logActivity: PortalActions["logActivity"] = (event) => {
      const ev: ActivityEvent = { id: uid("act"), at: event.at ?? new Date().toISOString(), kind: event.kind, title: event.title, leadId: event.leadId, lines: event.lines };
      patch((s) => ({ ...s, activity: [ev, ...s.activity] }));
      return ev;
    };
    return {
      getLead: (id) => stateRef.current.leads.find((l) => l.id === id),
      updateLead: (id, p) => patch((s) => ({ ...s, leads: s.leads.map((l) => (l.id === id ? { ...l, ...p } : l)) })),
      addLead: (lead) => patch((s) => ({ ...s, leads: [lead, ...s.leads] })),
      logActivity,
      startWorkflow: (kind, leadId) => {
        const def = WORKFLOW_BY_KIND[kind];
        const now = new Date().toISOString();
        let wf: LeadWorkflow | null = null;
        if (leadId) {
          const lead = stateRef.current.leads.find((l) => l.id === leadId);
          if (lead) {
            wf = {
              id: uid("wf"),
              kind,
              label: def.label.replace("Generate ", "").replace("Set ", "") + (kind === "set_appointments" ? " Setter" : kind === "recover_cancels" ? " Recovery" : ""),
              status: "active",
              startedAt: now,
              contactHours: "8:00 AM – 8:00 PM · Including weekends",
              summary: "",
              calls: [],
              sms: [],
              emails: [],
            };
            const next = wf;
            patch((s) => ({
              ...s,
              leads: s.leads.map((l) => (l.id === leadId ? { ...l, lastReachedAt: now, workflows: [next, ...l.workflows] } : l)),
            }));
            logActivity({ kind: "workflow_started", title: `${def.label} started for ${lead.firstName} ${lead.lastName}`, leadId, lines: ["Queued inside contact hours", "Agent will call, text and email until the goal is met"] });
          }
        } else {
          logActivity({ kind: "workflow_started", title: `${def.label} started`, lines: [def.description] });
        }
        return wf;
      },
      getStats: (range) => STATS[range],
      updateWallet: (p) => patch((s) => ({ ...s, wallet: { ...s.wallet, ...p } })),
      addCredits: (amount, currency, description) =>
        patch((s) => {
          const tx: WalletTransaction = { id: uid("tx"), at: new Date().toISOString(), kind: "purchase", description: description ?? (currency === "USDC" ? "USDC deposit" : "Usage credits"), amount, currency };
          return {
            ...s,
            wallet: {
              ...s.wallet,
              creditsUsd: currency === "USD" ? +(s.wallet.creditsUsd + amount).toFixed(2) : s.wallet.creditsUsd,
              usdcBalance: currency === "USDC" ? +(s.wallet.usdcBalance + amount).toFixed(2) : s.wallet.usdcBalance,
              transactions: [tx, ...s.wallet.transactions],
            },
          };
        }),
      addTransaction: (t) => patch((s) => ({ ...s, wallet: { ...s.wallet, transactions: [{ ...t, id: uid("tx"), at: new Date().toISOString() }, ...s.wallet.transactions] } })),
      updateBusiness: (p) => patch((s) => ({ ...s, settings: { ...s.settings, business: { ...s.settings.business, ...p } } })),
      updateNotifications: (p) => patch((s) => ({ ...s, settings: { ...s.settings, notifications: { ...s.settings.notifications, ...p } } })),
      updateAgent: (p) => patch((s) => ({ ...s, settings: { ...s.settings, agent: { ...s.settings.agent, ...p } } })),
      createTicket: (t) => {
        const ticket: SupportTicket = { ...t, id: `EE-${Math.floor(10000 + Math.random() * 89999)}`, createdAt: new Date().toISOString(), status: "open" };
        patch((s) => ({ ...s, tickets: [ticket, ...s.tickets] }));
        return ticket;
      },
      getThread: (key) => stateRef.current.threads[key] ?? [],
      setThread: (key, messages) => patch((s) => ({ ...s, threads: { ...s.threads, [key]: messages } })),
      clearThread: (key) =>
        patch((s) => {
          const threads = { ...s.threads };
          delete threads[key];
          return { ...s, threads };
        }),
      snapshot: () => {
        const s = stateRef.current;
        return { user: s.user, leads: s.leads, activity: s.activity, stats: STATS.all, wallet: s.wallet, settings: s.settings };
      },
      resetDemo: () => {
        reset();
        setState(INITIAL);
      },
      signOut: () => {
        reset();
        window.location.assign("/");
      },
    };
  }, [patch]);

  return (
    <StateCtx.Provider value={state}>
      <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
    </StateCtx.Provider>
  );
}

export function usePortal(): PortalState {
  const v = useContext(StateCtx);
  if (!v) throw new Error("usePortal must be used inside PortalProvider");
  return v;
}

export function usePortalActions(): PortalActions {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error("usePortalActions must be used inside PortalProvider");
  return v;
}
