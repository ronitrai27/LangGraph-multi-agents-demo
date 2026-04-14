"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ResearchAgentNodeProps {
  agentId: string;
  statusData: {
    agent: string;
    model?: string;
    status: string;
    query?: string;
    start_time?: number;
    is_done?: boolean;
  };
}

export function ResearchAgentNode({ agentId, statusData }: ResearchAgentNodeProps) {
  const [elapsed, setElapsed] = useState<string>("0.0s");

  useEffect(() => {
    if (!statusData.start_time || statusData.is_done) return;

    const interval = setInterval(() => {
      const seconds = (Date.now() / 1000 - statusData.start_time!).toFixed(1);
      setElapsed(`${seconds}s`);
    }, 100);

    return () => clearInterval(interval);
  }, [statusData.start_time, statusData.is_done]);

  // If we have a start time and it's done, we could show final time but for now simplicity:
  const displayTime = statusData.is_done ? "" : elapsed;

  return (
    <div className={cn(
      "my-2 p-2 border font-mono text-[10px] uppercase tracking-tighter shadow-sm transition-all duration-300",
      statusData.is_done ? "border-neutral-900 bg-neutral-900/10 opacity-60" : "border-neutral-800 bg-background text-neutral-100"
    )}>
      <div className="flex justify-between items-center opacity-40 mb-1 border-b border-neutral-900 pb-1">
        <div className="flex gap-2">
          <span>{statusData.agent}</span>
          {statusData.model && <span className="text-neutral-500">[{statusData.model}]</span>}
        </div>
        <div className="flex gap-3">
          {displayTime && <span className="text-neutral-400 font-bold tabular-nums">{displayTime}</span>}
          <span className={cn(statusData.is_done ? "text-neutral-600" : "animate-pulse text-emerald-500")}>
            [{statusData.is_done ? "PROCESS_COMPLETE" : "PROCESS_ACTIVE"}]
          </span>
        </div>
      </div>
      <div className="space-y-0.5">
        <div>
          <span className="text-neutral-500 mr-2">TASK:</span>
          {statusData.status}
        </div>
        {statusData.query && (
          <div className="truncate text-neutral-400">
            <span className="text-neutral-500 mr-2">QUERY:</span>
            {statusData.query}
          </div>
        )}
      </div>
    </div>
  );
}
