import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function Navbar({ onLogin }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-x-0 top-0 z-20"
    >
      {/* Thin top strip */}
      <div className="h-10 w-full bg-blue-900 text-white">
        <div className="flex h-full w-full items-center justify-center px-4 sm:px-6 lg:px-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-white/95 sm:text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
              <Sparkles className="h-4 w-4" />
              <span className="font-bold">AI</span>
            </span>
            <span className="text-center">AI-powered placement preparation platform</span>
          </div>
        </div>
      </div>

      {/* Main navbar */}
      <div className="flex w-full items-center justify-between px-2 pr-6 py-2 sm:px-4 sm:pr-8 lg:px-6 lg:pr-10">
        <div className="flex items-center gap-3">
          <img
            src="/images/logo.png"
            alt="PeerPrep"
            className="h-[106px] w-auto object-contain sm:h-[106px]"
          />
        </div>

        <motion.button
          type="button"
          onClick={onLogin}
          whileHover={{ scale: 1.04, y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="rounded-lg bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_-24px_rgba(14,165,233,0.55)] transition-all duration-300 hover:bg-sky-600 hover:shadow-[0_22px_55px_-26px_rgba(14,165,233,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        >
          Login
        </motion.button>
      </div>
    </motion.header>
  );
}
