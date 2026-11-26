import { LogoMark, Wordmark } from "./logo";

/**
 * Plays once on every full page load (a visit or a refresh), never on in-app navigation, because the root layout
 * does not re-render then. Pure CSS: it fades itself out, so the page is usable with scripting off, and it is
 * skipped entirely for people who ask for reduced motion.
 */
export function Intro() {
  return (
    <div className="intro" aria-hidden="true">
      <div className="intro__inner">
        <LogoMark size={76} draw />
        <span className="intro__word"><Wordmark /></span>
      </div>
    </div>
  );
}
