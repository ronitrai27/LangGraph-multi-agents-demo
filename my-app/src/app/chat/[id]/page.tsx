"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  Square,
  ArrowDown,
  Ellipsis,
  AlertTriangle,
} from "lucide-react";
import { AppCheckpoint, GraphNode } from "@/lib/langGraph/types";
import {
  AgentState,
  InterruptValue,
  ResumeValue,
} from "@/components/ai/AgentTypes";
import { ChatbotNode } from "@/components/ai/ChatbotNode";
import ApprovalCard from "@/components/ai/ApprovalCard";
import { useLangGraphAgent } from "@/lib/langGraph/useLangGraphAgent";

import { OrderAgentNode } from "@/components/ai/OrderAgentNode";
// TODO: import RefundAgentNode — eligibility result + refund confirmation card

const EXAMPLE_MESSAGES = [
  "What is the status of order ORD-001?",
  "Show all orders for John",
  "Process a refund for ORD-002",
  "Cancel order ORD-003",
];

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const [threadId] = useState(params.id);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [restoreError, setRestoreError] = useState(false);

  const { status, appCheckpoints, run, resume, restore, stop, restoring } =
    useLangGraphAgent<AgentState, InterruptValue, ResumeValue>();

  // Restore thread on mount
  useEffect(() => {
    if (threadId) {
      restore(threadId).catch(() => setRestoreError(true));
    }
  }, [threadId]);

  // Focus input when idle
  useEffect(() => {
    if (status !== "running" && !restoring) {
      inputRef.current?.focus();
    }
  }, [status, restoring]);

  // Auto-scroll on new content
  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [appCheckpoints, shouldAutoScroll]);

  // Scroll button visibility
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      setShowScrollButton(!isAtBottom);
      setShouldAutoScroll(isAtBottom);
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const sendMessage = (content: string) => {
    if (!content.trim() || status === "running" || restoring) return;
    setRestoreError(false);
    run({
      thread_id: threadId,
      state: { messages: [{ type: "user", content }] },
    });
  };

  const handleResume = (resumeValue: ResumeValue) => {
    resume({ thread_id: threadId, resume: resumeValue });
  };

  const renderNode = (
    checkpoint: AppCheckpoint<AgentState, InterruptValue>,
    node: GraphNode<AgentState>,
  ): React.ReactNode => {
    switch (node.name) {
      case "__start__":
      case "supervisor":
        // Supervisor produces the assistant message bubbles
        return <ChatbotNode nodeState={node.state} />;

      case "order_agent":
        return <OrderAgentNode nodeState={node.state} />;

      case "refund_agent":
        // TODO: return <RefundAgentNode nodeState={node.state} />
        // Show: eligibility result, then refund confirmation card
        return null;

      case "update_order":
        // HITL — only renders when graph is paused waiting for approval
        if (!checkpoint.interruptValue) return null;
        return (
          <ApprovalCard
            interruptValue={checkpoint.interruptValue}
            onResume={handleResume}
          />
        );

      default:
        return null;
    }
  };

  const isDisabled = status === "running" || restoring;

  return (
    <div className="flex flex-col h-screen bg-neutral-200">
      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4">
        <div className="space-y-2 max-w-2xl mx-auto w-full py-4">
          {appCheckpoints.map((checkpoint) =>
            checkpoint.error ? (
              <div
                key={checkpoint.checkpointConfig.configurable.checkpoint_id}
                className="text-sm text-red-500 font-medium p-2 bg-red-50 rounded-md flex items-center gap-2"
              >
                <AlertTriangle className="h-4 w-4" />
                Something went wrong. Please try again.
              </div>
            ) : (
              checkpoint.nodes.map((node, i) => (
                <div
                  key={`${checkpoint.checkpointConfig.configurable.checkpoint_id}-${i}`}
                >
                  {renderNode(checkpoint, node)}
                </div>
              ))
            ),
          )}

          {(status === "running" || restoring) && (
            <div className="flex items-center justify-center p-4">
              <Ellipsis className="w-6 h-6 text-muted-foreground animate-pulse" />
            </div>
          )}

          {status === "error" && (
            <div className="text-sm text-red-500 font-medium p-2 bg-red-50 rounded-md flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Error running agent.
            </div>
          )}

          {restoreError && (
            <div className="text-sm text-red-500 font-medium p-2 bg-red-50 rounded-md flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Could not restore chat. Is the agent server running?
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to bottom */}
      {showScrollButton && (
        <Button
          className="fixed bottom-28 right-8 rounded-full shadow-md"
          size="icon"
          variant="outline"
          onClick={() =>
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <ArrowDown />
        </Button>
      )}

      {/* Input */}
      <div className="flex-shrink-0 p-2 pb-4">
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {EXAMPLE_MESSAGES.map((msg) => (
              <Button
                key={msg}
                variant="outline"
                size="sm"
                onClick={() => sendMessage(msg)}
                disabled={isDisabled}
                className="text-xs font-mono w-full truncate"
              >
                {msg}
              </Button>
            ))}
          </div>

          <div className="relative">
            <Textarea
              ref={inputRef}
              className="pr-24 resize-none font-mono border bg-neutral-50"
              placeholder="Ask about an order, refund, or status update..."
              value={inputValue}
              disabled={isDisabled}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(inputValue);
                  setInputValue("");
                }
              }}
            />
            {status === "running" ? (
              <Button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                size="icon"
                variant="destructive"
                onClick={() => stop(threadId)}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                size="icon"
                variant="outline"
                disabled={!inputValue.trim() || restoring}
                onClick={() => {
                  sendMessage(inputValue);
                  setInputValue("");
                }}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
