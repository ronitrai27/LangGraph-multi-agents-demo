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
    <div className="flex flex-col flex-1 items-center justify-center font-sans">
      {/* CTA Button */}
      <div className="text-center">
        <button
          className="bg-primary text-primary-foreground hover:opacity-90 transition-opacity px-8 py-4 rounded-lg text-lg font-medium"
          onClick={handleAddChat}
        >
          Start New Chat
        </button>
      </div>
    </div>
  );
}
