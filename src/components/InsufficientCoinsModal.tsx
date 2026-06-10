"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REDIRECT_SECONDS = 10;

// Shown when an action fails for lack of coins. Offers a "Top Up" button and
// auto-redirects to the buy (top-up) page after 10 seconds.
export default function InsufficientCoinsModal({
  message,
  onClose,
}: {
  message?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [left, setLeft] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    const tick = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    const go = setTimeout(() => router.push("/buy"), REDIRECT_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(go); // cancelled if the user closes the modal first
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-400/15 text-2xl">⚠️</div>
        <h2 className="mt-3 text-xl font-bold">Not enough coins</h2>
        <p className="mt-2 text-sm text-slate-300">
          {message || "You don't have enough coins for this. Top up to keep playing."}
        </p>

        <button onClick={() => router.push("/buy")} className="btn-gold mt-5 w-full text-lg">
          ＋ Top Up
        </button>
        <button onClick={onClose} className="btn-ghost mt-2 w-full text-sm">
          Cancel
        </button>

        <p className="mt-3 text-xs text-slate-500">
          Taking you to the top-up page in <span className="font-semibold text-slate-300 tabular-nums">{left}s</span>…
        </p>
      </div>
    </div>
  );
}
