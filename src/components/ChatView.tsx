"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

interface Sender {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface Payment {
  id: string;
  amount: number;
  receiver: Sender;
}

interface Message {
  id: string;
  content: string;
  type: string;
  imageUrl: string | null;
  createdAt: string;
  sender: Sender;
  payment: Payment | null;
}

interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
}

interface ChatViewProps {
  conversationId: string;
  currentUserId: string;
  onShowPayment: () => void;
}

export default function ChatView({
  conversationId,
  currentUserId,
  onShowPayment,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setMessages([]);

    apiGet<MessagesResponse>(
      `/api/conversations/${conversationId}/messages`
    )
      .then((data) => setMessages(data.messages.reverse()))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");

    try {
      const data = await apiPost<{ message: Message }>(
        `/api/conversations/${conversationId}/messages`,
        { content: text, type: "TEXT" }
      );
      setMessages((prev) => [...prev, data.message]);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <p className="text-center text-sm text-zinc-500">
            Loading messages...
          </p>
        )}

        {error && (
          <p className="text-center text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && messages.length === 0 && (
          <p className="text-center text-sm text-zinc-500">
            No messages yet. Say hello!
          </p>
        )}

        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {messages.map((msg) => {
            const isOwn = msg.sender.id === currentUserId;
            const isPayment = msg.payment !== null;

            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    isPayment
                      ? "bg-emerald-600 text-white"
                      : isOwn
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-100"
                  }`}
                >
                  {!isOwn && (
                    <p className="mb-0.5 text-xs font-medium text-zinc-300">
                      {msg.sender.displayName}
                    </p>
                  )}

                  {isPayment ? (
                    <p className="text-lg font-semibold">
                      ${(msg.payment!.amount / 100).toFixed(2)}
                    </p>
                  ) : null}

                  {msg.content && (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  )}

                  <p
                    className={`mt-1 text-[10px] ${
                      isPayment
                        ? "text-emerald-200"
                        : isOwn
                          ? "text-blue-200"
                          : "text-zinc-500"
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-zinc-800 bg-zinc-900 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            type="button"
            onClick={onShowPayment}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500"
            aria-label="Send payment"
          >
            $
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 rounded-full bg-zinc-800 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none ring-zinc-600 focus:ring-1"
            disabled={sending}
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
            aria-label="Send message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l15.5-6.5a.75.75 0 0 0 0-1.424l-15.5-6.5Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
