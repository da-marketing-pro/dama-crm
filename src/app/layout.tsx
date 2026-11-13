import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { TelegramWebAppInit } from "@/components/providers/TelegramWebAppInit";

export const metadata: Metadata = {
  title: "DAMA CRM — Корпоративная система управления",
  description: "Модульная система DAMA CRM с интеграцией WhatsApp и мультивалютным учетом",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <AuthProvider>
          <TelegramWebAppInit />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
