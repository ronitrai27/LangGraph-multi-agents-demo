"use client";

import { useState } from "react";
import { Loader2, Package, ArrowRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  UpdateOrderInterrupt,
  ResumeValue,
  OrderStatus,
} from "@/components/ai/AgentTypes";

interface ApprovalCardProps {
  interruptValue: UpdateOrderInterrupt;
  onResume: (resumeValue: ResumeValue) => void;
}

const STATUS_STYLES: Record<
  OrderStatus,
  { bg: string; text: string; dot: string }
> = {
  processing: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-400" },
  shipped: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-400",
  },
  delivered: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  cancelled: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-400" },
  returned: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-400",
  },
  refunded: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLES[status] ?? {
    bg: "bg-gray-50",
    text: "text-gray-700",
    dot: "bg-gray-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

export default function ApprovalCard({
  interruptValue,
  onResume,
}: ApprovalCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (!interruptValue) return null;

  const { order_id, product, current_status, new_status, reason, amount } =
    interruptValue;

  const handleAction = (action: ResumeValue) => {
    setIsLoading(true);
    onResume(action);
  };

  return (
    <div className="flex justify-end">
      <div className="w-full max-w-sm rounded-2xl border border-orange-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-orange-50 border-b border-orange-100">
          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
          <p className="text-sm font-semibold text-orange-800">
            Admin approval required
          </p>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Order + product */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 shrink-0">
              <Package className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{product}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {order_id} · ${amount.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Status change */}
          <div className="flex items-center gap-2">
            <StatusBadge status={current_status} />
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            <StatusBadge status={new_status} />
          </div>

          {/* Reason */}
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-xs text-gray-400 mb-0.5 font-medium uppercase tracking-wide">
              Reason
            </p>
            <p className="text-sm text-gray-700">{reason}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 pb-4">
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAction("cancel")}
              disabled={isLoading}
              className="text-gray-600"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleAction("approve")}
              disabled={isLoading}
              className="bg-gray-900 hover:bg-gray-700 text-white"
            >
              Approve
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
