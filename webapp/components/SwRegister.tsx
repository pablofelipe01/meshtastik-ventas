"use client";

import { useEffect } from "react";

/** Registra el service worker para que la PWA sea instalable. */
export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
