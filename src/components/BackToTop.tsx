"use client";

import { useEffect, useState } from "react";

// "Back to top" button, bottom-right. Hidden while the hero (first screen) is in
// view; it appears once the user scrolls into the section after the hero.
export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
      className="anim-bob fixed bottom-4 right-4 z-50 grid h-12 w-12 place-items-center rounded-full bg-amber-400 text-2xl font-black text-slate-900 shadow-lg transition hover:scale-105 hover:bg-amber-300"
    >
      ↑
    </button>
  );
}
