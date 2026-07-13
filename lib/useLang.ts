"use client";

import { useState, useEffect, useCallback } from "react";
import { t, type Lang } from "./i18n";

const STORAGE_KEY = "hoodbot_lang";

export function useLang() {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && (saved === "en" || saved === "id" || saved === "zh")) {
      setLangState(saved);
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    // Dispatch so all consumers react
    window.dispatchEvent(new CustomEvent("hoodbot:lang", { detail: next }));
  }, []);

  // Listen for changes from other components
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<Lang>).detail;
      setLangState(next);
    };
    window.addEventListener("hoodbot:lang", handler);
    return () => window.removeEventListener("hoodbot:lang", handler);
  }, []);

  return { lang, setLang, tr: t[lang] };
}
