"use client";

import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTour } from "@/components/tour/TourProvider";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const HEADLINE = "Get your marketplace earnings sooner";

export function LandingHero() {
  const root = useRef<HTMLElement>(null);
  const tour = useTour();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { duration: 0.7, ease: "power3.out" } });
        tl.from(".hero-line > span", { yPercent: 110, stagger: 0.08 }, 0)
          .from(".hero-support", { autoAlpha: 0, y: 16 }, "<0.25")
          .from(".hero-actions", { autoAlpha: 0, y: 12 }, "<0.1")
          .from(".hero-figures", { autoAlpha: 0, y: 20 }, "<0.1");

        const maxInset = () => Math.min(48, Math.max(16, window.innerWidth * 0.03));
        const maxRadius = () => (window.innerWidth <= 680 ? 18 : 28);
        const inset = gsap.to(root.current, {
          "--hero-inset": () => `${maxInset()}px`,
          "--hero-radius": () => `${maxRadius()}px`,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=240",
            scrub: true,
            invalidateOnRefresh: true,
          },
        });

        return () => {
          tl.kill();
          inset.kill();
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="landing-hero">
      <div className="landing-hero-inner">
        <div className="hero-copy">
          <span className="sandbox-pill">SANDBOX · STELLAR TESTNET</span>
          <h1 className="hero-headline" aria-label={HEADLINE}>
            {HEADLINE.split(" ").map((word, i) => (
              <span className="hero-line" key={`${word}-${i}`}>
                <span>{word}&nbsp;</span>
              </span>
            ))}
          </h1>
          <p className="hero-support">
            Jejak funds marketplace earnings that have been earned but not yet paid out — with clear
            evidence before every decision and no crypto knowledge required.
          </p>
          <div className="hero-actions">
            <button type="button" className="button button-primary" onClick={() => tour.openSelect()}>
              ▶ Mulai walkthrough terpandu
            </button>
            <Link href="/seller/onboarding" className="button button-secondary">Coba sistem langsung (Testnet)</Link>
          </div>
          <p className="hero-actions-note">
            <strong>Walkthrough</strong> memakai data contoh (mock) — tur terpandu tanpa transaksi nyata.{" "}
            <strong>Coba sistem langsung</strong> memakai data nyata di Stellar Testnet (bukan mock).
          </p>
        </div>
        <div className="hero-figures">
          <p className="hero-figures-title">Example values</p>
          <div className="hero-figure-row">
            <span>Unsettled earnings</span>
            <strong>Rp100.000.000</strong>
          </div>
          <div className="hero-figure-row">
            <span>Eligible funding value</span>
            <strong>Rp80.000.000</strong>
          </div>
          <div className="hero-figure-row hero-figure-primary">
            <span>Funds available now</span>
            <strong>Rp64.000.000</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
