/* theme state: system (default) / light / dark. The inline script in
   index.html mirrors this resolution before first paint; keep in step. */
import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "touchstone-theme";

function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system")
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return choice;
}
function apply(choice: ThemeChoice) {
  const t = resolve(choice);
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  });
  useEffect(() => {
    apply(choice);
    if (choice === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const on = () => apply("system");
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }
  }, [choice]);
  const setIt = (c: ThemeChoice) => {
    setChoice(c);
    if (c === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, c);
  };
  return [choice, setIt];
}

export function useHash(): string {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}
