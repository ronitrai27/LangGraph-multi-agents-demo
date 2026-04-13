"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import { toast } from "sonner";
import {
  Send,
  Bot,
  User,
  Loader2,
  Wrench,
  Cpu,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Terminal,
  ArrowDown,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────

interface ActionRequest {
  name: string;
  args: Record<string, unknown>;
}

interface HITLInterruptValue {
  actionRequests: ActionRequest[];
}

interface HITLDecision {
  decisions: Array<{ type: "approve" | "reject" }>;
}

// ─────────────────────────────────────────────────────────────
//  ROXO CHAT
// ─────────────────────────────────────────────────────────────

export function RoxoChat() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // ── useStream hook ──────────────────────────────────────────
  // We use ["values", "tools"] stream modes for maximum visibility.
  const stream = useStream<
    { messages: Message[] },
    { InterruptType: HITLInterruptValue }
  >({
    apiUrl:
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/agent",
    assistantId: "roxo",
    threadId,
    streamMode: ["values", "tools"], // Track tools in real-time
    onThreadId: (id) => {
      setThreadId(id);
    },
    onError: (err) => {
      console.error("[ROXO error]", err);
      toast.error("ROXO encountered an error", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
    onFinish: (state) => {
      console.log("[ROXO finished]", state);
      toast.success("Response complete");
    },
    onCustomEvent: (data) => {
      console.log("[ROXO event]", data);
    },
  });

  // ── Computed: Chat Messages ─────────────────────────────────
  // We filter out technical messages to keep the UI clean.
  const chatMessages = useMemo(() => {
    return stream.messages.filter((msg) => {
      const type = msg.type || (msg as any).role;
      // During streaming, chunks might not have a type yet, but they have content
      const isHuman = type === "human" || type === "user";
      const isAI =
        type === "ai" || type === "assistant" || (!type && msg.content);

      if (isHuman) return true;
      if (isAI) {
        const content = msg.content;
        const hasText =
          typeof content === "string"
            ? content.trim().length > 0
            : Array.isArray(content)
              ? content.some((c) =>
                  typeof c === "string"
                    ? c.trim().length > 0
                    : (c as any).text?.trim().length > 0,
                )
              : false;

        // Hide tool-trigger messages with no content
        const hasToolCalls =
          (msg as any).tool_calls && (msg as any).tool_calls.length > 0;
        if (hasToolCalls && !hasText) return false;

        return true; // Keep AI messages that have content, even if it's just streaming
      }
      return false;
    });
  }, [stream.messages]);

  // ── Computed: Active Tools ──────────────────────────────────
  const activeTools = useMemo(() => {
    return stream.toolProgress.filter(
      (t) => t.state === "starting" || t.state === "running",
    );
  }, [stream.toolProgress]);

  // ── Auto-scroll & Visibility ────────────────────────────────
  useEffect(() => {
    if (scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTools, stream.isLoading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom =
      target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ── Handlers: Submit ────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || stream.isLoading) return;

    const userMessage = input.trim();
    setInput("");

    stream.submit(
      { messages: [{ type: "human", content: userMessage }] },
      {
        optimisticValues: (prev) => ({
          ...prev,
          messages: [
            ...(prev.messages ?? []),
            {
              type: "human",
              content: userMessage,
              id: `opt-${Date.now()}`,
            } as Message,
          ],
        }),
      },
    );
  };

  const handleDecision = (type: "approve" | "reject") => {
    stream.submit(null, {
      command: { resume: { decisions: [{ type }] } },
    });
    toast.info(`Action ${type}d`);
  };

  const hitlRequest = stream.interrupt?.value as HITLInterruptValue | undefined;

  // ─────────────────────────────────────────────────────────────
  //  UI COMPONENTS
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)] max-w-5xl mx-auto dark:bg-zinc-950 dark:text-zinc-100 bg-zinc-50 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden transition-colors">
      {/* ── Header ── */}
      <header className="px-8 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/20">
              <Bot size={26} />
            </div>
            {stream.isLoading && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-4 border-white dark:border-zinc-900 animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">ROXO PM</h1>
            <p className="text-xs text-zinc-500 font-medium">
              {stream.isLoading
                ? "Analyzing project data..."
                : "Active session"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {threadId && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono text-zinc-500 border border-zinc-200 dark:border-zinc-700">
              <Terminal size={12} />
              <span>{threadId.split("-")[0]}</span>
            </div>
          )}
          <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
            <Info size={18} className="text-zinc-400" />
          </button>
        </div>
      </header>

      {/* ── Chat Container ── */}
      <div
        className="flex-1 overflow-y-auto px-8 py-8 space-y-8 relative"
        onScroll={handleScroll}
      >
        <AnimatePresence initial={false}>
          {chatMessages.map((msg, idx) => {
            const type = msg.type || (msg as any).role;
            const isHuman = type === "human" || type === "user";
            const meta = stream.getMessagesMetadata(msg);
            const nodeName = (meta as any)?.langgraph_node as
              | string
              | undefined;

            return (
              <motion.div
                key={`msg-${msg.id || idx}`}
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`flex gap-5 ${isHuman ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                    isHuman
                      ? "bg-white dark:bg-zinc-800 border dark:border-zinc-700"
                      : "bg-indigo-600 text-white"
                  }`}
                >
                  {isHuman ? (
                    <User size={20} className="text-zinc-500" />
                  ) : (
                    <Bot size={20} />
                  )}
                </div>

                {/* Content */}
                <div
                  className={`flex flex-col gap-1.5 max-w-[80%] ${isHuman ? "items-end" : "items-start"}`}
                >
                  {nodeName && !isHuman && (
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest px-1">
                      {nodeName.replace(/_/g, " ")}
                    </span>
                  )}
                  <div
                    className={`px-5 py-4 rounded-3xl leading-relaxed shadow-sm ${
                      isHuman
                        ? "bg-zinc-900 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-tr-none"
                        : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-tl-none"
                    }`}
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {typeof msg.content === "string" ? msg.content : "..."}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* ── Real-time Tool Progress ── */}
        <AnimatePresence>
          {activeTools.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="ml-14 space-y-3"
            >
              {activeTools.map((tool) => (
                <div
                  key={tool.toolCallId}
                  className="flex items-center gap-3 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl w-fit"
                >
                  <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Cpu
                      size={14}
                      className="text-indigo-600 animate-spin-slow"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-indigo-900 dark:text-indigo-400 uppercase tracking-tight">
                      {tool.name.replace("ask_", "Consulting: ")}
                    </p>
                    <p className="text-[10px] text-indigo-500 font-medium">
                      {(tool.data as any)?.message || "Processing request..."}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scroll Anchor */}
        <div ref={scrollAnchorRef} className="h-4" />
      </div>

      {/* ── Scroll Button ── */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-xl hover:scale-110 active:scale-95 transition-all text-indigo-500 z-20"
        >
          <ArrowDown size={20} />
        </button>
      )}

      {/* ── HITL / Approval UI ── */}
      <AnimatePresence>
        {hitlRequest && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="absolute bottom-24 left-8 right-8 p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-3xl shadow-2xl backdrop-blur-xl flex items-start gap-5 z-30"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg">
              <PauseCircle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-400 uppercase tracking-wider mb-1">
                Human Approval Requried
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-500 mb-4 font-medium">
                ROXO is ready to perform project writes. Proceed?
              </p>

              <div className="space-y-2 mb-5">
                {hitlRequest.actionRequests.map((req, i) => (
                  <div
                    key={i}
                    className="flex gap-4 text-xs font-mono bg-white/50 dark:bg-black/20 p-3 rounded-xl border border-amber-200/50 dark:border-amber-900/20"
                  >
                    <span className="text-amber-600 font-bold">{req.name}</span>
                    <span className="text-zinc-500 truncate">
                      {JSON.stringify(req.args)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleDecision("approve")}
                  className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <CheckCircle2 size={18} />
                  Authorize
                </button>
                <button
                  onClick={() => handleDecision("reject")}
                  className="flex-1 h-11 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl text-xs font-bold transition-all border border-zinc-200 dark:border-zinc-700"
                >
                  Deny
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input Widget ── */}
      <footer className="p-6 bg-white dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800">
        <form
          onSubmit={handleSubmit}
          className="relative max-w-4xl mx-auto flex items-center gap-4"
        >
          <div className="flex-1 relative group">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={stream.isLoading || !!hitlRequest}
              placeholder={
                hitlRequest
                  ? "Waiting for authorization..."
                  : "Ask ROXO anything about the project..."
              }
              className="w-full h-14 pl-6 pr-14 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-zinc-400 font-medium"
            />
            <div className="absolute right-2 top-2">
              {stream.isLoading ? (
                <button
                  type="button"
                  onClick={() => stream.stop()}
                  className="w-10 h-10 flex items-center justify-center bg-zinc-200 dark:bg-zinc-700 text-zinc-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || !!hitlRequest}
                  className="w-10 h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 active:scale-95"
                >
                  <Send size={20} />
                </button>
              )}
            </div>
          </div>
        </form>
        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
            <Loader2
              size={10}
              className={stream.isLoading ? "animate-spin text-indigo-500" : ""}
            />
            {stream.isLoading ? "Synthesizing" : "Ready"}
          </div>
          <div className="w-1 h-1 rounded-full bg-zinc-300" />
          <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
            {stream.messages.length} Events Logged
          </div>
        </div>
      </footer>
    </div>
  );
}
