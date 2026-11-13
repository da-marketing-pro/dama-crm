"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close?: () => void;
        enableClosingConfirmation?: () => void;
        initData?: string;
        initDataUnsafe?: Record<string, unknown>;
      };
    };
  }
}

export function TelegramWebAppInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        if (typeof tg.enableClosingConfirmation === "function") {
          tg.enableClosingConfirmation();
        }
        document.body.classList.add("is-tg-webapp");
      } catch (err) {
        console.warn("Telegram WebApp init warning:", err);
      }
    }
  }, []);

  return null;
}
