import { WithMessages } from "@/lib/langGraph/types";

// The agent state which mirrors the LangGraph state.
export interface AgentState extends WithMessages {
  agent_status?: {
    agent: string;
    status: string;
  };
}

// The payload sent by the graph when update_order_status needs human approval.
// Mirrors the dict passed to interrupt() in update_order node.
export interface UpdateOrderInterrupt {
  message: string;
  order_id: string;
  product: string;
  current_status: OrderStatus;
  new_status: OrderStatus;
  reason: string;
  amount: number;
}

export type OrderStatus =
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded";

// Only one HITL in this graph — update_order_status
export type InterruptValue = UpdateOrderInterrupt;

// Resume values accepted by the graph
export type ResumeValue = "approve" | "cancel";
