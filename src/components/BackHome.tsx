import Link from "next/link";

/** Obvious way back to the Today screen. Sits at the top left of every other screen. */
export function BackHome() {
  return (
    <Link
      href="/"
      data-testid="back-home"
      className="glass press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full! px-4 font-medium"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back to Today
    </Link>
  );
}
