// The product mark: a kestrel in profile, wings folded, drawn for Kestrel.
export function KestrelMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="16" fill="var(--amethyst)" />
      <path
        d="M8 20.5c3.2-.4 5.6-1.9 7.2-4.6L19 9.6c.6-1 1.9-1.4 3-.9l2.4 1.1-2.2 1.2-.9 4.5c-.6 3.1-3.2 5.5-6.4 5.9L11 22l-3 .1z"
        fill="#ffffff"
      />
      <circle cx="21.2" cy="11" r="1" fill="var(--amethyst)" />
      <path d="M12.5 21.6l-2.2 3.2 3.6-2.9z" fill="var(--steel)" />
    </svg>
  );
}
