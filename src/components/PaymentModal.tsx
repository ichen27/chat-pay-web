"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";

interface PaymentModalProps {
  conversationId: string;
  onClose: () => void;
  onSuccess: () => void;
  senderBalance: number;
}

export default function PaymentModal({
  conversationId,
  onClose,
  onSuccess,
  senderBalance,
}: PaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount);
  const valid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= senderBalance;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || sending) return;

    setSending(true);
    setError(null);

    try {
      await apiPost("/api/payments", {
        conversationId,
        amount: parsedAmount,
        note: note.trim(),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-100">Send Payment</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Balance */}
        <div className="border-b border-zinc-800 px-5 py-3">
          <p className="text-xs text-zinc-500">Your balance</p>
          <p className="text-lg font-semibold text-emerald-400">
            ${senderBalance.toFixed(2)}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label htmlFor="payment-amount" className="mb-1 block text-xs font-medium text-zinc-400">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
              <input
                id="payment-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg bg-zinc-800 py-2 pl-7 pr-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-zinc-600 focus:ring-1"
                disabled={sending}
                autoFocus
              />
            </div>
            {amount && !isNaN(parsedAmount) && parsedAmount > senderBalance && (
              <p className="mt-1 text-xs text-red-400">Exceeds your balance</p>
            )}
          </div>

          <div>
            <label htmlFor="payment-note" className="mb-1 block text-xs font-medium text-zinc-400">
              Note
            </label>
            <textarea
              id="payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's this for?"
              rows={2}
              className="w-full resize-none rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-zinc-600 focus:ring-1"
              disabled={sending}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={!valid || sending}
            className="rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            {sending ? "Sending..." : `Send${valid ? ` $${parsedAmount.toFixed(2)}` : ""}`}
          </button>
        </form>
      </div>
    </div>
  );
}
