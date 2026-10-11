import { useEffect, useState } from "react";

/** Same rule as the Tailwind `short:` screen (phones in landscape): for sizes CSS classes can't express. */
const QUERY = "(max-height: 520px)";

export function useShortScreen(): boolean {
  const [short, setShort] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setShort(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return short;
}
