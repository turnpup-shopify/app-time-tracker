"use client";

import { useEffect } from "react";

export type ToastState = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "ok" | "error";
  ms?: number;
} | null;

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.ms ?? 6000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="toast-in fixed inset-x-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-glass-border bg-[#1a1e2b]/95 px-4 py-3 shadow-xl backdrop-blur-xl"
    >
      <span className={`flex-1 ${toast.tone === "error" ? "text-danger" : "text-ink"}`}>
        {toast.message}
      </span>
      {toast.actionLabel && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.();
            onClose();
          }}
          className="min-h-12 min-w-12 rounded-xl px-3 font-semibold text-[#8fb0ff]"
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}
