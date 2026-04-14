import { WithMessages } from "@/lib/langGraph/types";

/**
 * Finding from a research subagent.
 */
export interface Finding {
  agent: string;
  aspect: string;
  query: string;
  summary: string;
}

/**
 * The agent state mapping directly to ResearchState in graph.py.
 */
export interface AgentState extends WithMessages {
  research_plan?: string;
  findings: Finding[];
  final_report?: string;
  iterations: number;
  // Record of all concurrent agent statuses
  active_statuses?: Record<string, {
    agent: string;
    model?: string;
    status: string;
    query?: string;
    start_time?: number;
    is_done?: boolean;
  }>;
}

/**
 * The payload sent by the graph when the create_document tool triggers an interrupt.
 * Mirrors the dict passed to interrupt() in hitl_document node.
 */
export interface DocumentApprovalInterrupt {
  type: "document_approval";
  message: string;
  summary: string;
  filename: string;
  report_preview: string;
  word_count: number;
}

// Only one HITL type in this graph currently
export type InterruptValue = DocumentApprovalInterrupt;

/**
 * Resume values accepted by the graph for the hitl_document interrupt.
 */
export type ResumeValue = "approve" | "cancel";
