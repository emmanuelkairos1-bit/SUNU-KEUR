"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import { cn, fcfa } from "@/lib/utils";

interface CountUpProps {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  currency?: boolean;
  className?: string;
  decimals?: number;
}

export function CountUp({
  to,
  duration = 1.6,
  prefix = "",
  suffix = "",
  currency = false,
  className,
  decimals = 0
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, to, mv]);

  useEffect(() => spring.on("change", (v) => {
    setDisplay(
      currency
        ? fcfa(v)
        : v.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    );
  }), [spring, currency, decimals]);

  return (
    <motion.span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {display}
      {suffix}
    </motion.span>
  );
}
