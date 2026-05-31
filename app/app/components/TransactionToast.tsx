"use client";

import { useEffect } from "react";
import { useGameStore, ToastMessage } from "../store/gameStore";

const EXPLORER_BASE = "https://explorer.solana.com/tx";

function Toast({ toast }: { toast: ToastMessage }) {
  const removeToast = useGameStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  const icon =
    toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ";

  const borderColor =
    toast.type === "success"
      ? "border-[#00ff88]/40"
      : toast.type === "error"
      ? "border-[#ff4757]/40"
      : "border-blue-500/40";

  const iconColor =
    toast.type === "success"
      ? "text-[#00ff88]"
      : toast.type === "error"
      ? "text-[#ff4757]"
      : "text-blue-400";

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border ${borderColor}
                  bg-[#1a1d26]/95 backdrop-blur shadow-xl
                  animate-slide-in max-w-sm w-full`}
    >
      <span className={`text-lg font-bold shrink-0 ${iconColor}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-snug">{toast.message}</p>
        {toast.txSignature && (
          <a
            href={`${EXPLORER_BASE}/${toast.txSignature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-[#00ff88] transition mt-1 block truncate"
          >
            View on Explorer ↗
          </a>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="text-gray-600 hover:text-white transition shrink-0 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

export default function TransactionToasts() {
  const toasts = useGameStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} />
        </div>
      ))}
    </div>
  );
}
