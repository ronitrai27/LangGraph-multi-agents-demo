"use client";

import { Package, MapPin, Calendar, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AgentState } from "./AgentTypes";
import { cn } from "@/lib/utils";

interface OrderAgentNodeProps {
  nodeState: Partial<AgentState>;
}

export function OrderAgentNode({ nodeState }: OrderAgentNodeProps) {
  const status = nodeState.agent_status;
  
  // If the agent is currently working
  const isWorking = !!status;

  return (
    <div className="flex justify-start my-4">
      <div className="w-full max-w-sm rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
        {/* Header */}
        <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100/50">
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm font-bold text-blue-900 font-mono uppercase tracking-wider">
              Order Lookup
            </span>
          </div>
          {isWorking && (
             <Clock className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {status?.status && (
            <div className="flex items-start gap-3">
              <div className="text-sm text-blue-800 font-medium leading-relaxed bg-blue-50/30 p-2 rounded-lg border border-blue-50/50 w-full italic">
                "{status.status}"
              </div>
            </div>
          )}

          {/* This is where we could show structured order data if passed in nodeState */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-mono uppercase">
              <span>System Log</span>
              <span>v1.0.2</span>
            </div>
            <div className="h-px bg-gray-100 w-full" />
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Connected to Inventory DB...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
