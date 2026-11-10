"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { messages, type Lang, type MessageKey } from "@/lib/i18n/messages";

export type Theme = "dark" | "light";
export type DateStyle = "month" | "year" | "full" | "monthShort" | "monthName";

type Ctx = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  fmtNumber: (n: number, digits?: number) => string;
  fmtDate: (iso: string, style?: DateStyle) => string;
  theme: Theme;
  toggleTheme: () => void;
  announce: (msg: string) => void;
};

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <Providers>");
  return ctx;
}

const LANG_KEY = "earthjukebox.lang";
const THEME_KEY = "earthjukebox.theme";

export function Providers({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [theme, setThemeState] = useState<Theme>("dark");
  const [live, setLive] = useState("");
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored === "en" || stored === "ar" || stored === "fr") setLangState(stored);
    } catch {
      /* storage unavailable */
    }
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") setThemeState(attr);
  }, []);

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = messages[lang]["meta.title"];
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const announce = useCallback((msg: string) => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    setLive("");
    liveTimer.current = setTimeout(() => setLive(msg), 60);
  }, []);

  const value = useMemo<Ctx>(() => {
    const dict = messages[lang];
    const en = messages.en;
    const t: Ctx["t"] = (key, params) => {
      let s: string = dict[key] ?? en[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    };
    const fmtNumber = (n: number, digits = 2) =>
      new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
    const fmtDate = (iso: string, style: DateStyle = "month") => {
      const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return iso;
      const opts: Intl.DateTimeFormatOptions =
        style === "monthName"
          ? { month: "long" }
          : style === "year"
          ? { year: "numeric" }
          : style === "full"
            ? { year: "numeric", month: "long", day: "numeric" }
            : style === "monthShort"
              ? { year: "numeric", month: "short" }
              : { year: "numeric", month: "long" };
      return new Intl.DateTimeFormat(lang, { ...opts, timeZone: "UTC" }).format(d);
    };
    return { lang, dir, setLang, t, fmtNumber, fmtDate, theme, toggleTheme, announce };
  }, [lang, dir, setLang, theme, toggleTheme, announce]);

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {live}
      </div>
    </AppContext.Provider>
  );
}
