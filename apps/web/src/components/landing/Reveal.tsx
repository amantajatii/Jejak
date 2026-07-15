"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Generic scroll-reveal wrapper. Content is fully visible in plain CSS by
 * default — GSAP only enhances the entrance and never blocks rendering if
 * the script fails to load. Skips animation entirely under
 * prefers-reduced-motion.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(root.current, {
          autoAlpha: 0,
          y: 28,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: root.current,
            start: "top 85%",
            toggleActions: "play none none none",
            once: true,
          },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
