// The pre-start motion, kept deliberately small: the slide/fade between phases, the progress line, checks
// that draw themselves, resume chips fading in and the resume reading bar. Every class keeps its final
// look as the base style, so prefers-reduced-motion (which switches the animations off) shows the finished
// state, never a blank one.

const CSS = `
@keyframes anviSlideNext { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: none; } }
@keyframes anviSlidePrev { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: none; } }
@keyframes anviFadeUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes anviDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes anviPop { 0% { transform: scale(.5); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
@keyframes anviSlide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@keyframes anviShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

.anvi-slide-next { animation: anviSlideNext 280ms cubic-bezier(.2,.75,.2,1) both; }
.anvi-slide-prev { animation: anviSlidePrev 280ms cubic-bezier(.2,.75,.2,1) both; }
.anvi-fade-up { animation: anviFadeUp 320ms cubic-bezier(.2,.75,.2,1) both; }
.anvi-draw { stroke-dasharray: 1; stroke-dashoffset: 0; animation: anviDraw 420ms 80ms cubic-bezier(.65,0,.35,1) both; }
.anvi-pop { animation: anviPop 320ms cubic-bezier(.2,.75,.2,1) both; }
.anvi-indeterminate { animation: anviSlide 1.4s cubic-bezier(.45,0,.55,1) infinite; }
.anvi-shimmer { background-size: 200% 100%; animation: anviShimmer 1.8s linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .anvi-slide-next, .anvi-slide-prev, .anvi-fade-up, .anvi-draw, .anvi-pop, .anvi-shimmer { animation: none !important; }
  .anvi-indeterminate { animation: none !important; transform: none !important; width: 100% !important; opacity: .45; }
}
`;

/** The keyframes above, as one <style>. Rendering it more than once is harmless. */
export function AiMotionStyles() {
  return <style>{CSS}</style>;
}

/** A check mark that draws itself inside a small circle (static under reduced motion). */
export function AnimatedCheck({ className = "h-5 w-5", tone = "emerald" }) {
  const fill = tone === "white" ? "bg-white/25 text-white" : tone === "primary" ? "bg-violet-600 text-white dark:bg-violet-500" : "bg-emerald-500 text-white dark:bg-emerald-500/90";
  return <span aria-hidden="true" className={`anvi-pop inline-flex shrink-0 items-center justify-center rounded-full ${fill} ${className}`}>
    <svg viewBox="0 0 24 24" className="h-[64%] w-[64%]" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path className="anvi-draw" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  </span>;
}
