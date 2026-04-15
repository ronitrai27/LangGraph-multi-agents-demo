"use client";

import { useChatStore } from "@/store/ChatStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function WelcomePage() {
  const { addChat } = useChatStore();
  const router = useRouter();

  const handleAddChat = () => {
    toast.promise(
      new Promise((resolve) => {
        const newChat = addChat();
        resolve(newChat);
      }),
      {
        loading: "Creating new chat...",
        success: (newChat: any) => {
          router.push(`/chat/${newChat.id}`);
          return "Chat created successfully!";
        },
        error: "Failed to create chat",
      },
    );
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 text-center font-sans">
      {/* Heading */}
      <h1 className="text-3xl md:text-4xl font-bold mb-4">
        MULTI-AGENT RESEARCH SYSTEM
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        made by <span className="font-semibold">ROX</span>
        <br />
        (feel free to use, edit and contribute)
      </p>

      {/* Steps */}
      <div className="max-w-xl text-left space-y-4 mb-8">
        <div>
          <p className="font-semibold">Step 1 →</p>
          <p className="text-muted-foreground">Say hi to the agent</p>
        </div>

        <div>
          <p className="font-semibold">Step 2 →</p>
          <p className="text-muted-foreground">
            Ask it to do deep research about anything
          </p>
        </div>

        <div>
          <p className="font-semibold">Step 3 →</p>
          <p className="text-muted-foreground">
            It will generate full content — tell it to create a document
          </p>
        </div>

        <div>
          <p className="font-semibold">Step 4 →</p>
          <p className="text-muted-foreground">
            Approve the document if no changes are needed
          </p>
        </div>

        <div>
          <p className="font-semibold">Done →</p>
          <p className="text-muted-foreground">
            Download your document with full citations 🚀
          </p>
        </div>
      </div>

      {/* CTA Button */}
      <button
        className="bg-primary text-primary-foreground hover:opacity-90 transition px-4 py-2 rounded-lg text-sm font-medium"
        onClick={handleAddChat}
      >
        Start New Chat
      </button>

      {/* Footer Link */}
      <a
        href="https://github.com/ronitrai27/LangGraph-multi-agents-demo"
        target="_blank"
        className="mt-6 text-sm text-blue-500 hover:underline"
      >
        Want to edit or contribute? View on GitHub
      </a>
    </div>
  );
}
