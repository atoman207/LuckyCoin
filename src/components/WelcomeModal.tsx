"use client";

import { useEffect } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";

const AUTO_CLOSE_MS = 10_000;

// Shown once after a new sign-up. Auto-dismisses after 10 seconds, or the user
// can close it with the × button.
export default function WelcomeModal() {
  const { welcomeOpen, closeWelcome } = useUser();

  useEffect(() => {
    if (!welcomeOpen) return;
    const t = setTimeout(closeWelcome, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [welcomeOpen, closeWelcome]);

  if (!welcomeOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" onClick={closeWelcome}>
      <div
        className="card relative w-full max-w-sm p-8 text-center animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeWelcome}
          aria-label="Close"
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          ✕
        </button>
        <CoinIcon type="gold" size={72} className="mx-auto animate-pop" />
        <h2 className="mt-4 text-2xl font-extrabold">Welcome aboard! 🎉</h2>
        <p className="mt-2 text-lg text-slate-200">We hope you get today&apos;s lucky coin.</p>
        <p className="mt-4 text-xs text-slate-500">This message closes automatically.</p>
      </div>
    </div>
  );
}
