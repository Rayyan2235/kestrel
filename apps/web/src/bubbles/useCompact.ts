import { useEffect, useState } from "react";

/** True on phone widths, where the room shows one bubble and the rail uses tabs. */
export const COMPACT_QUERY = "(max-width: 600px)";

export function useCompact(): boolean {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(COMPACT_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return compact;
}
