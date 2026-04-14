import { AgentState } from "@/components/ai/AgentTypes";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatbotNodeProps {
  nodeState: Partial<AgentState>;
}

export function ChatbotNode({ nodeState }: ChatbotNodeProps) {
  return (
    <div className="space-y-4 my-2 font-mono">
      {nodeState?.messages?.map((msg, index) => (
        <div
          key={msg.id ?? index}
          className="flex flex-col gap-1 py-2 border-b border-neutral-800/50"
        >
          <div className="text-[10px] font-bold uppercase text-neutral-500 tracking-tighter">
            {msg.type === "ai" ? "Assistant" : "User"}
          </div>
          <div className="text-sm text-neutral-100 leading-relaxed max-w-none prose prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------
// import { AgentState } from "@/components/ai/AgentTypes";
// import { User, Sparkles, Brain } from "lucide-react";
// import { cn } from "@/lib/utils";
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";

// interface ChatbotNodeProps {
//   nodeState: Partial<AgentState>;
// }

// export function ChatbotNode({ nodeState }: ChatbotNodeProps) {
//   const getMessageTheme = (type: string) => {
//     switch (type) {
//       case "ai":
//       case "assistant":
//         return {
//           icon: <Brain className="h-5 w-5 text-blue-600" />,
//           container: "bg-white border border-blue-50",
//           bubble: "text-gray-800",
//           iconBg: "bg-blue-50",
//         };
//       case "user":
//       case "human":
//         return {
//           icon: <User className="h-5 w-5 text-gray-600" />,
//           container: "bg-gray-50/50 border border-gray-100",
//           bubble: "text-gray-700",
//           iconBg: "bg-gray-100",
//         };
//       default:
//         return {
//           icon: <Sparkles className="h-5 w-5 text-purple-600" />,
//           container: "bg-white border border-purple-50",
//           bubble: "text-gray-800",
//           iconBg: "bg-purple-50",
//         };
//     }
//   };

//   return (
//     <div className="space-y-6 my-6">
//       {nodeState?.messages?.map((msg, index) => {
//         const theme = getMessageTheme(msg.type);
//         return (
//           <div
//             key={msg.id ?? index}
//             className={cn(
//               "flex items-start gap-4 p-4 rounded-3xl transition-all duration-300",
//               theme.container,
//             )}
//           >
//             <div
//               className={cn(
//                 "flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl shadow-sm",
//                 theme.iconBg,
//               )}
//             >
//               {theme.icon}
//             </div>
//             <div className="flex-1 min-w-0 pt-1">
//               <div className="prose prose-sm max-w-none">
//                 <ReactMarkdown
//                   remarkPlugins={[remarkGfm]}
//                   components={{
//                     p: ({ children }) => (
//                       <p className="mb-4 last:mb-0 leading-relaxed text-sm">
//                         {children}
//                       </p>
//                     ),
//                     h1: ({ children }) => (
//                       <h1 className="text-xl font-bold mb-4 text-gray-900 border-b pb-2">
//                         {children}
//                       </h1>
//                     ),
//                     h2: ({ children }) => (
//                       <h2 className="text-lg font-bold mb-3 text-gray-800">
//                         {children}
//                       </h2>
//                     ),
//                     ul: ({ children }) => (
//                       <ul className="list-disc pl-5 mb-4 space-y-2">
//                         {children}
//                       </ul>
//                     ),
//                     ol: ({ children }) => (
//                       <ol className="list-decimal pl-5 mb-4 space-y-2">
//                         {children}
//                       </ol>
//                     ),
//                     code: ({ children, className }) => {
//                       const isInline = !className?.includes("language-");
//                       return (
//                         <code
//                           className={cn(
//                             "font-mono text-xs rounded px-1.5 py-0.5",
//                             isInline
//                               ? "bg-gray-100 text-gray-800"
//                               : "block bg-gray-900 text-gray-100 p-4 my-4 overflow-x-auto shadow-inner",
//                           )}
//                         >
//                           {children}
//                         </code>
//                       );
//                     },
//                   }}
//                 >
//                   {msg.content}
//                 </ReactMarkdown>
//               </div>
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// }
