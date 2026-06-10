"use client";

import type { CSSProperties } from "react";
import CoinIcon from "@/components/CoinIcon";
import type { CoinType } from "@/lib/coins";

// Glowing coin "effect" shown on every demo win — styled like the in-game
// reveal but with a log-in call to action. Intentionally a DIFFERENT modal
// from the post-trial login gate.
const GLOW: Record<CoinType, { glow: string; ray: string; name: string }> = {
  gold: { glow: "rgba(251,191,36,0.95)", ray: "rgba(251,191,36,0.5)", name: "Gold" },
  silver: { glow: "rgba(226,232,240,0.9)", ray: "rgba(226,232,240,0.45)", name: "Silver" },
  bronze: { glow: "rgba(205,127,50,0.95)", ray: "rgba(205,127,50,0.5)", name: "Bronze" },
};

export default function DemoCoinModal({
  coin,
  onLogin,
  onClose,
}: {
  coin: CoinType;
  onLogin: () => void;
  onClose: () => void;
}) {
  const cfg = GLOW[coin];
  return (
    <div
      className="reveal-overlay fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      style={{ "--glow": cfg.glow, "--ray": cfg.ray } as CSSProperties}
    >
      <div className="flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <div className="relative grid h-[280px] w-[280px] place-items-center">
          <div className="reveal-rays pointer-events-none absolute inset-[-60px] rounded-full opacity-40" />
          <div className="reveal-glow pointer-events-none absolute inset-0 rounded-full" />
          <div className="reveal-coin relative drop-shadow-2xl">
            <CoinIcon type={coin} size={160} />
          </div>
        </div>
        <div className="relative -mt-2 max-w-xs text-center">
          <p className="text-2xl font-extrabold text-white drop-shadow">You found a {cfg.name} coin! 🎉</p>
          <p className="mt-2 text-slate-300">
            In the free trial it isn&apos;t saved. <strong className="text-amber-200">Log in</strong> to
            keep your coins and enjoy the full game — daily rewards, the prize wheel and more.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button onClick={onLogin} className="btn-gold w-full">
              Log in / Register
            </button>
            <button onClick={onClose} className="btn-ghost w-full text-sm">
              Keep trying
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
