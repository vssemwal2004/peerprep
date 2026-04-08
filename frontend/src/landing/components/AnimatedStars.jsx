import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const MotionDiv = motion.div;

const STARS = [
  { id: 1, top: "10%", left: "12%", size: 18, color: "text-sky-300", delay: 0.2, duration: 4.8 },
  { id: 2, top: "16%", right: "14%", size: 14, color: "text-emerald-400", delay: 1.1, duration: 5.4 },
  { id: 3, top: "33%", left: "8%", size: 12, color: "text-amber-200", delay: 0.8, duration: 5.8 },
  { id: 4, top: "38%", right: "10%", size: 16, color: "text-sky-200", delay: 1.5, duration: 5.2 },
  { id: 5, top: "62%", left: "14%", size: 15, color: "text-rose-200", delay: 0.5, duration: 6.1 },
  { id: 6, top: "68%", right: "12%", size: 13, color: "text-sky-300", delay: 1.8, duration: 5.6 },
  { id: 7, top: "22%", left: "24%", size: 28, color: "text-sky-300/90", delay: 0.4, duration: 6.4 },
  { id: 8, top: "44%", right: "22%", size: 24, color: "text-amber-100", delay: 1.3, duration: 6.7 },
];

export default function AnimatedStars() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {STARS.map((star) => (
        <MotionDiv
          key={star.id}
          className={`absolute ${star.color}`}
          style={star.left ? { top: star.top, left: star.left } : { top: star.top, right: star.right }}
          initial={{ opacity: 0.18, scale: 0.8 }}
          animate={{
            opacity: [0.14, 0.6, 0.16],
            scale: [0.72, 1.08, 0.82],
            y: [0, -8, 0],
          }}
          transition={{
            duration: star.duration,
            delay: star.delay,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        >
          <Sparkles size={star.size} strokeWidth={1.8} />
        </MotionDiv>
      ))}
    </div>
  );
}
