export default function Navbar({ onLogin }) {
  return (
    <header className="relative z-20 bg-white">
      <div className="flex h-8 w-full items-center justify-center bg-[#123d79] px-3 text-white">
        <div className="inline-flex items-center gap-2 text-center text-[10px] font-semibold tracking-wide text-white/95 sm:text-xs">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2">
              <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" />
              <path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
            </svg>
            <span className="font-bold">AI</span>
          </span>
          <span>AI-powered placement preparation platform</span>
        </div>
      </div>

      <nav
        aria-label="Primary navigation"
        className="mx-auto flex h-[60px] w-full max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8"
      >
        <a
          href="/"
          aria-label="PeerPrep home"
          className="flex h-full w-[156px] items-center overflow-visible sm:w-[180px]"
        >
          <img
            src="/images/logo.png"
            alt="PeerPrep"
            width="400"
            height="267"
            className="h-auto w-full scale-[1.26] object-contain"
          />
        </a>

        <button
          type="button"
          onClick={onLogin}
          className="rounded-lg bg-[#089ee4] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_-12px_rgba(14,165,233,0.9)] transition-colors hover:bg-[#078cc9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 sm:px-6"
        >
          Login
        </button>
      </nav>
    </header>
  );
}
