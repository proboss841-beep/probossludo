import io from "socket.io-client";

const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export const socket = io(API_ORIGIN || "/", {
  path: "/socket.io",
  autoConnect: false,
  withCredentials: true,
});

export function setSocketToken(token) {
  socket.auth = { token };
}
