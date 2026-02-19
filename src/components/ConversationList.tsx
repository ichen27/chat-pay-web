"use client";

import { useEffect, useState } from "react";

interface Member {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface LastMessage {
  id: string;
  body: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  members: Member[];
  lastMessage: LastMessage | null;
  updatedAt: string;
}

interface ConversationListProps {
  onSelect: (id: string) => void;
  selectedId?: string;
}

export default function ConversationList({ onSelect, selectedId }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    fetch("/api/conversations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load conversations");
        const data = await res.json();
        setConversations(data.conversations);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <aside className="flex h-full w-72 flex-col bg-zinc-900 text-zinc-100">
      <h2 className="px-4 py-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Conversations
      </h2>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="px-4 py-2 text-sm text-zinc-500">Loading...</p>
        )}

        {error && (
          <p className="px-4 py-2 text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && conversations.length === 0 && (
          <p className="px-4 py-2 text-sm text-zinc-500">No conversations yet</p>
        )}

        {conversations.map((conv) => {
          const displayNames = conv.members.map((m) => m.user.displayName).join(", ");
          const preview = conv.lastMessage?.body ?? "No messages yet";
          const isSelected = conv.id === selectedId;

          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full px-4 py-3 text-left transition-colors hover:bg-zinc-800 ${
                isSelected ? "bg-zinc-700" : ""
              }`}
            >
              <p className="truncate text-sm font-medium text-zinc-100">
                {displayNames || "Unknown"}
              </p>
              <p className="truncate text-xs text-zinc-400">{preview}</p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
