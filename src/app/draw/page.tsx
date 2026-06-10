"use client";

import { useMemo, useState } from "react";
import { useUser } from "@/components/UserProvider";
import PrizeWheel from "@/components/PrizeWheel";
import { WHEEL_VALUES, WHEEL_SPIN_MS } from "@/lib/coins";

const DAY_MS = 24 * 60 * 60 * 1000;
const SEG = 360 / WHEEL_VALUES.length;

function shuffle(arr: number[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DrawPage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const [layout, setLayout] = useState<number[]>(() => shuffle(WHEEL_VALUES));
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canSpinNow = useMemo(() => {
    if (!profile) return false;
    if (!profile.last_draw_at) return true;
    return Date.now() - new Date(profile.last_draw_at).getTime() >= DAY_MS;
  }, [profile]);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Log in to spin</h1>
        <p className="mt-2 text-slate-300">The daily prize wheel is free for members, once every 24 hours.</p>
        <button onClick={openAuth} className="btn-gold mt-6">Log in / Register</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-slate-400">Loading…</div>;

  async function spin() {
    if (spinning) return;
    setMessage(null);
    setResult(null);
    setSpinning(true);
    try {
      const res = await fetch("/api/draw", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.spun) {
        setMessage(data.message);
        setSpinning(false);
        return;
      }

      // Show the server's wheel layout, then rotate so the winning segment
      // lands under the pointer (with extra full turns for effect).
      setLayout(data.layout);
      const k = data.winningIndex as number;
      const jitter = (Math.random() - 0.5) * (SEG - 4); // land anywhere within the segment
      const align = (360 - ((k * SEG) % 360)) % 360;
      const base = Math.ceil(rotation / 360) * 360;
      const target = base + 360 * 6 + align + jitter;
      // Next frame so the layout/transition apply cleanly.
      requestAnimationFrame(() => setRotation(target));

      window.setTimeout(() => {
        setProfile(data.profile);
        setResult(data.value);
        setSpinning(false);
      }, WHEEL_SPIN_MS + 100);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Spin failed.");
      setSpinning(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <div>
        <h1 className="text-3xl font-extrabold">Daily prize wheel</h1>
        <p className="text-slate-400">One free spin every 24 hours. Win up to 100 bronze!</p>
      </div>

      <PrizeWheel layout={layout} rotation={rotation} spinning={spinning} spinMs={WHEEL_SPIN_MS} />

      {result !== null && (
        <div className="card animate-pop border-amber-300/40 bg-amber-300/10 px-4 py-3 text-lg font-bold text-amber-100">
          {result > 0 ? `🎉 You won ${result} bronze!` : "No luck this time — come back tomorrow!"}
        </div>
      )}
      {message && <div className="rounded-xl bg-amber-300/10 px-4 py-3 text-amber-200">{message}</div>}

      <button
        onClick={spin}
        disabled={spinning || (!canSpinNow && result === null)}
        className="btn-gold text-lg !px-10 !py-3"
      >
        {spinning ? "Spinning…" : canSpinNow || result !== null ? "▶ Start" : "Come back tomorrow"}
      </button>

      <p className="text-xs text-slate-500">
        The 1,000 and 500 segments are teasers — the pointer never lands there. Wins are added to
        your wallet as bronze.
      </p>
    </div>
  );
}
