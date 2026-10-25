import type { BotId } from "@kestrel/contracts";

// The Microduck head in profile, in each bot's own colourway, with a marking that
// tells them apart without colour: Pip wears one dot, Nova a double stripe.
const SHELL = { pip: "#4a4846", nova: "#b4a4d4" } as const;
export function BotFace({ id, size = 32 }: { id: BotId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="bot-face">
      <rect width="32" height="32" rx="16" fill="#f7f7f5" />
      <path d="M6 19c0-6.2 4.6-10 10.5-10S27 12.5 27 18.4V21H6z" fill={SHELL[id]} />
      <rect x="5" y="20" width="22" height="3.2" rx="1.6" fill="#e5b93e" />
      <circle cx="19.5" cy="16" r="3.6" fill="#141414" />
      <circle cx="19.5" cy="16" r="1.7" fill="#cfcfcf" />
      {id === "pip" ? (
        <circle cx="11" cy="14" r="1.8" fill="#f7f7f5" />
      ) : (
        <g fill="#141414">
          <rect x="9" y="12.2" width="5" height="1.3" rx="0.65" />
          <rect x="9" y="14.8" width="5" height="1.3" rx="0.65" />
        </g>
      )}
    </svg>
  );
}
