"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square, ArrowDown, AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { AppCheckpoint, GraphNode } from "@/lib/langGraph/types";
import {
  AgentState,
  InterruptValue,
  ResumeValue,
} from "@/components/ai/AgentTypes";
import { ChatbotNode } from "@/components/ai/ChatbotNode";
import ApprovalCard from "@/components/ai/ApprovalCard";
import { ResearchAgentNode } from "@/components/ai/ResearchAgentNode";
import { useLangGraphAgent } from "@/lib/langGraph/useLangGraphAgent";

const RESEARCH_EXAMPLES = [
  "Research the impact of AI on the current job market 2024",
  "Latest breakthroughs in solid state batteries and major patent holders",
  "Find academic papers on zero-knowledge proofs in healthcare",
  "Report on the commercial space flight competition (SpaceX vs Blue Origin)",
];

export default function ResearchChatPage() {
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

  useEffect(() => {
    if (threadId) {
      restore(threadId).catch(() => setRestoreError(true));
    }
  }, [threadId]);

  useEffect(() => {
    if (status !== "running" && !restoring) {
      inputRef.current?.focus();
    }
  }, [status, restoring]);

  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [appCheckpoints, shouldAutoScroll]);

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
    setInputValue("");
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
        return <ChatbotNode nodeState={node.state} />;
      case "researcher_a":
      case "researcher_b":
        if (!node.state.active_statuses) return null;
        return (
          <div className="space-y-1">
            {Object.entries(node.state.active_statuses).map(([agentId, data]) => (
              <ResearchAgentNode key={agentId} agentId={agentId} statusData={data} />
            ))}
          </div>
        );
      case "hitl_document":
        // 1. Persist the card
        const isActuallyDone = !!checkpoint.state.final_report;
        const interrupt = checkpoint.interruptValue;
        const hitlData = interrupt || (checkpoint.state as any).hitl_data;
        
        // 2. Also check for a final response message from this node
        const hasMessages = !!node.state.messages && node.state.messages.length > 0;

        return (
          <div className="space-y-4">
            {hitlData && (
              <ApprovalCard
                interruptValue={hitlData}
                isCompleted={isActuallyDone}
                onResume={handleResume}
              />
            )}
            {hasMessages && <ChatbotNode nodeState={node.state} />}
          </div>
        );
      default:
        return null;
    }
  };

  const isDisabled = status === "running" || restoring;

  return (
    <div className="flex flex-col h-screen bg-background text-neutral-100 font-mono">
      {/* Header */}
      <header className="p-4 border-b border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest">
          Research Protocol v1.0
        </span>
        {status === "running" && <Spinner className="w-4 h-4" />}
      </header>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {appCheckpoints.map((checkpoint) =>
            checkpoint.error ? (
              <div
                key={checkpoint.checkpointConfig.configurable.checkpoint_id}
                className="text-red-500 py-2 border-b border-red-900/30"
              >
                [SYSTEM ERROR]
              </div>
            ) : (
              checkpoint.nodes.map((node, i) => {
                // If it's the first checkpoint and has messages, we show the User's input first
                const isFirstCheckpoint = appCheckpoints.indexOf(checkpoint) === 0 && i === 0;
                const userMessages = isFirstCheckpoint ? checkpoint.state.messages?.filter(m => m.type === 'human') : [];
                
                return (
                  <div key={`${checkpoint.checkpointConfig.configurable.checkpoint_id}-${i}`}>
                    {userMessages?.map((m, idx) => (
                      <ChatbotNode key={`user-${idx}`} nodeState={{ messages: [m] }} />
                    ))}
                    {renderNode(checkpoint, node)}
                  </div>
                );
              })
            ),
          )}

          {(status === "running" || restoring) && (
            <div className="flex gap-2 items-center py-4 text-neutral-500">
              <Spinner className="w-3 h-3" />
              <span className="text-[10px] uppercase tracking-tighter">
                AI is thinking...
              </span>
            </div>
          )}

          {status === "error" && (
            <div className="text-red-500 py-2">[CONNECTION ERROR]</div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-neutral-800">
        <div className="max-w-4xl mx-auto flex gap-2 items-start">
          <Textarea
            ref={inputRef}
            className="flex-1 bg-transparent border border-neutral-800 p-2 min-h-[40px] focus:outline-none"
            placeholder="Input research parameters..."
            value={inputValue}
            disabled={isDisabled}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(inputValue);
              }
            }}
          />
          {status === "running" ? (
            <Button
              variant="destructive"
              size="icon"
              onClick={() => stop(threadId)}
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="border border-neutral-800"
              disabled={!inputValue.trim() || restoring}
              onClick={() => sendMessage(inputValue)}
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {showScrollButton && (
        <Button
          className="fixed bottom-24 right-8 rounded-none border border-neutral-800 bg-background"
          size="icon"
          onClick={() =>
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <ArrowDown className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
