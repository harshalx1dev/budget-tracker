import { BRAND } from "@/lib/brand";

/**
 * The mark: a "b" whose bowl is a coin. Drawn with two strokes so the intro can draw it in, and sized in ems-free
 * pixels so it stays crisp from a 16px favicon to the intro screen. Colours come from the theme tokens.
 */
export function LogoMark({ size = 28, draw = false }: { size?: number; draw?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${BRAND.name} logo`} className="logo" data-draw={draw || undefined}>
      <rect className="logo__tile" width="64" height="64" rx="18" />
      <path className="logo__stem" d="M24 13.5V47" pathLength="1" />
      <circle className="logo__bowl" cx="36" cy="37" r="10.5" pathLength="1" />
      <circle className="logo__coin" cx="36" cy="37" r="2.6" />
    </svg>
  );
}

/** "Budggyy" with the double g in the accent colour: the g pair is the name's signature. */
export function Wordmark() {
  const [a, b] = BRAND.name.toLowerCase().split("gg");
  return (
    <span className="wordmark__text" aria-label={BRAND.name}>
      <span aria-hidden>{a}<span className="wordmark__gg">gg</span>{b}</span>
    </span>
  );
}
