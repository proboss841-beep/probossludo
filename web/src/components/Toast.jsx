import React, { createContext, useCallback, useContext, useState } from "react";

const ToastCtx = createContext(null);

/**
 * Lightweight toast notifications. Previously this provider was a stub (no-op)
 * so battle balance warnings never surfaced. Now it renders an animated,
 * auto-dismissing popup in the top-centre so users actually SEE notifications
 * like "Insufficient balance".
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = "info", ttl = 3500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  }, []);

  const colors = {
    info: "bg-white text-slate-700 border-slate-300",
    success: "bg-emerald-600 text-white border-emerald-500",
    error: "bg-rose-600 text-white border-rose-500",
  };

  return (
    <ToastCtx.Provider
      value={{
        toast: {
          info: (m) => push(m, "info"),
          success: (m) => push(m, "success"),
          error: (m) => push(m, "error", 5000),
        },
      }}
    >
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[3000] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-sm animate-rise rounded-2xl border px-5 py-3 text-center text-sm font-extrabold shadow-[0_10px_24px_rgba(30,20,60,0.22)] ${colors[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}