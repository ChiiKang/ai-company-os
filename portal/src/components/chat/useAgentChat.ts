import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentAdapter, AgentReply, ChatMessage, WorkflowKind } from "@/types";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { newMessage, resolveAgent } from "@/api/agent";
import { useToast } from "@/components/ui";

export interface SendOptions {
  /** Attached file names (not uploaded; mentioned in the message). */
  files?: string[];
}

export interface AgentChat {
  threadKey: string;
  messages: ChatMessage[];
  /** Live text of the message currently streaming (kept out of the store until done). */
  draft: string;
  streaming: boolean;
  adapterName: string;
  send: (text: string, opts?: SendOptions) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
  clear: () => void;
}

/**
 * Wires the chat surface to the portal store and the agent adapter.
 * Thread key = leadId ?? "global". Messages persist through setThread; the
 * streaming buffer lives in a ref and is flushed to React once per frame.
 */
export function useAgentChat(leadId: string | undefined, workflow: WorkflowKind | undefined): AgentChat {
  const threadKey = leadId ?? "global";
  const state = usePortal();
  const actions = usePortalActions();
  const toast = useToast();

  const messages = useMemo(() => state.threads[threadKey] ?? [], [state.threads, threadKey]);

  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [adapterName, setAdapterName] = useState("EnergyEngine agent");

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const adapterRef = useRef<AgentAdapter | null>(null);
  const appliedRef = useRef<Set<string>>(new Set());
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;

  useEffect(() => {
    let alive = true;
    resolveAgent().then((a) => {
      if (!alive) return;
      adapterRef.current = a;
      setAdapterName(a.name);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* A thread reloaded mid-stream (page refresh) can carry a dangling "streaming" message. */
  useEffect(() => {
    if (streaming) return;
    const stale = messages.some((m) => m.status === "streaming");
    if (!stale) return;
    actions.setThread(
      threadKey,
      messages.map((m) => (m.status === "streaming" ? { ...m, status: m.content ? "done" : "error" } : m)),
    );
  }, [messages, streaming, threadKey, actions]);

  /* Abort any in-flight stream when the thread changes or the page unmounts. */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [threadKey]);

  const flush = useCallback(() => {
    rafRef.current = null;
    setDraft(bufferRef.current);
  }, []);

  const onDelta = useCallback(
    (text: string) => {
      bufferRef.current += text;
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  const patchMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      actions.setThread(
        threadKey,
        actions.getThread(threadKey).map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [actions, threadKey],
  );

  const applyEffects = useCallback(
    (messageId: string, reply: AgentReply) => {
      if (!reply.effects?.length || appliedRef.current.has(messageId)) return;
      appliedRef.current.add(messageId);
      let started = false;
      for (const fx of reply.effects) {
        if (fx.type === "start_workflow") {
          if (started) continue;
          started = true;
          actions.startWorkflow(fx.workflow, fx.leadId ?? leadId);
          toast("Workflow started", "success");
        } else if (fx.type === "log_activity") {
          actions.logActivity(fx.event);
        }
      }
    },
    [actions, leadId, toast],
  );

  /** Runs the adapter against `history` and fills `assistantId`. */
  const run = useCallback(
    async (history: ChatMessage[], assistantId: string) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      bufferRef.current = "";
      setDraft("");
      setStreaming(true);
      try {
        const adapter = adapterRef.current ?? (await resolveAgent());
        adapterRef.current = adapter;
        setAdapterName(adapter.name);
        const reply = await adapter.send(
          { messages: history, context: { leadId, workflow: workflowRef.current }, snapshot: actions.snapshot() },
          onDelta,
          ctrl.signal,
        );
        if (ctrl.signal.aborted) {
          patchMessage(assistantId, { content: bufferRef.current, status: "done" });
        } else {
          patchMessage(assistantId, { content: reply.content, cards: reply.cards, status: "done" });
          applyEffects(assistantId, reply);
        }
      } catch {
        if (ctrl.signal.aborted) {
          patchMessage(assistantId, { content: bufferRef.current, status: "done" });
        } else {
          patchMessage(assistantId, { content: bufferRef.current, status: "error" });
        }
      } finally {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (abortRef.current === ctrl) abortRef.current = null;
        bufferRef.current = "";
        setDraft("");
        setStreaming(false);
      }
    },
    [actions, applyEffects, leadId, onDelta, patchMessage],
  );

  const send = useCallback(
    async (text: string, opts: SendOptions = {}) => {
      const trimmed = text.trim();
      const files = opts.files ?? [];
      if (!trimmed && !files.length) return;
      if (abortRef.current) return;
      const content = files.length ? `${trimmed}${trimmed ? "\n\n" : ""}Attached: ${files.join(", ")}` : trimmed;
      const user = newMessage("user", content);
      const assistant = newMessage("assistant", "", { status: "streaming" });
      const history = [...actions.getThread(threadKey), user];
      actions.setThread(threadKey, [...history, assistant]);
      await run(history, assistant.id);
    },
    [actions, run, threadKey],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(async () => {
    if (abortRef.current) return;
    const current = actions.getThread(threadKey);
    const last = current[current.length - 1];
    if (!last || last.role !== "assistant" || last.status !== "error") return;
    const history = current.slice(0, -1);
    const assistant = newMessage("assistant", "", { status: "streaming" });
    actions.setThread(threadKey, [...history, assistant]);
    await run(history, assistant.id);
  }, [actions, run, threadKey]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    actions.clearThread(threadKey);
  }, [actions, threadKey]);

  return { threadKey, messages, draft, streaming, adapterName, send, stop, retry, clear };
}
