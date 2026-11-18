"use client";
import { motion, useReducedMotion } from "motion/react";

/** Fast, subtle route transition inside the panel (150–220ms, respects reduced motion). */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}
