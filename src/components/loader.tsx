import { LogoMark } from "./logo";

/** The site-wide loading animation: the mark breathes while its coin ring chases itself. */
export function Loader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-label={label}>
      <LogoMark size={44} />
    </div>
  );
}
