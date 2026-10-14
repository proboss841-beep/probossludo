import React, { createContext, useContext } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const toast = {
    info: () => {},
    success: () => {},
    error: (message) => console.error("[App]", message),
  };

  return <ToastCtx.Provider value={toast}>{children}</ToastCtx.Provider>;
}

export function useToast() {
  return useContext(ToastCtx);
}