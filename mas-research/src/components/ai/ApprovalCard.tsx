"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentApprovalInterrupt, ResumeValue } from "./AgentTypes";
import { cn } from "@/lib/utils";

interface ApprovalCardProps {
  interruptValue: DocumentApprovalInterrupt;
  isCompleted?: boolean;
  onResume: (resumeValue: ResumeValue) => void;
}

export default function ApprovalCard({
  interruptValue,
  isCompleted,
  onResume,
}: ApprovalCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (!interruptValue) return null;

  const { summary, filename, word_count } = interruptValue;

  const handleAction = (action: ResumeValue) => {
    setIsLoading(true);
    onResume(action);
  };

  return (
    <div className={cn(
      "my-4 p-4 border font-mono",
      isCompleted ? "border-emerald-900 bg-emerald-900/5 opacity-80" : "border-emerald-900/50 bg-background"
    )}>
      <div className="flex justify-between items-start mb-2">
        <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
          [APPROVAL_PROTOCOL: DOCUMENT_CREATION]
        </div>
        {isCompleted && (
          <div className="text-[10px] bg-emerald-900 text-emerald-100 px-2 py-0.5 font-bold">
            CLOSED // AUTHORIZED
          </div>
        )}
      </div>
      
      <div className="text-xs text-neutral-400 mb-4 tracking-tight leading-relaxed italic border-l border-neutral-800 pl-3">
        {summary}
      </div>

      <div className="text-[10px] text-neutral-500 mb-6 flex gap-4 uppercase">
        <span>FILE: {filename}.DOCX</span>
        <span>VOL: {word_count} WORDS</span>
      </div>

      {!isCompleted && (
        <div className="flex gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAction("cancel")}
            disabled={isLoading}
            className="text-[10px] uppercase border border-neutral-800 rounded-none h-8 px-4"
          >
            {isLoading ? "..." : "Cancel"}
          </Button>
          <Button
            size="sm"
            onClick={() => handleAction("approve")}
            disabled={isLoading}
            className="text-[10px] uppercase bg-emerald-900/20 text-emerald-400 border border-emerald-900 rounded-none h-8 px-6"
          >
            {isLoading ? "Generating..." : "Authorize Creation"}
          </Button>
        </div>
      )}
    </div>
  );
}
