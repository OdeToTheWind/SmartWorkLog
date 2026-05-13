import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

const ThemeCtx = createContext(null);
const STORAGE_KEY = "worklog_theme"; // 'system' | 'light' | 'dark'

function resolveActual(pref) {
  if (pref === "dark" || pref === "light") return pref;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function applyTheme(actual) {
  const root = document.documentElement;
  if (actual === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = actual;
}

export const ThemeProvider = ({ children }) => {
  const [pref, setPref] = useState(() => {
    if (typeof window === "undefined") return "system";
    return localStorage.getItem(STORAGE_KEY) || "system";
  });
  const [actual, setActual] = useState(() => resolveActual(pref));

  useEffect(() => {
    const next = resolveActual(pref);
    setActual(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, pref);
  }, [pref]);

  // Listen to OS changes only when pref is 'system'
  useEffect(() => {
    if (pref !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const next = mq.matches ? "dark" : "light";
      setActual(next);
      applyTheme(next);
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [pref]);

  const cycle = useCallback(() => {
    setPref((p) => (p === "system" ? "light" : p === "light" ? "dark" : "system"));
  }, []);

  const value = useMemo(() => ({ pref, setPref, actual, cycle }), [pref, actual, cycle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
};

export const useTheme = () => useContext(ThemeCtx) || { pref: "system", actual: "light", setPref: () => {}, cycle: () => {} };
