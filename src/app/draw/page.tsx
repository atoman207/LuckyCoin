"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserProvider";
import PrizeWheel from "@/components/PrizeWheel";
import {
  WHEEL_VALUES,
  WHEEL_SPIN_MS,
  drawCooldownLeftMs,
  formatDrawCountdown,
} from "@/lib/coins";

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
  const [now, setNow] = useState(() => Date.now());

  const msUntilNext = useMemo(
    () => (profile ? drawCooldownLeftMs(profile.last_draw_at, now) : 0),
    [profile, now]
  );
  const canSpinNow = !profile?.last_draw_at || msUntilNext <= 0;

  useEffect(() => {
    if (!profile?.last_draw_at) return;
    if (drawCooldownLeftMs(profile.last_draw_at) <= 0) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (drawCooldownLeftMs(profile.last_draw_at, Date.now()) <= 0) {
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [profile?.last_draw_at]);

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
    if (spinning || !canSpinNow) return;
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
        setNow(Date.now());
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
        <p className="text-slate-400">One free spin every 24 hours. Win up to 1000 bronze!</p>
      </div>

      <PrizeWheel layout={layout} rotation={rotation} spinning={spinning} spinMs={WHEEL_SPIN_MS} />

      <div className="space-y-2">
        <button
          onClick={spin}
          disabled={spinning || !canSpinNow}
          className="btn-gold text-lg !px-10 !py-3 font-mono tabular-nums"
        >
          {spinning ? "Spinning…" : canSpinNow ? "▶ Start" : formatDrawCountdown(msUntilNext)}
        </button>
        {!canSpinNow && !spinning && (
          <p className="text-sm text-slate-400">Next free spin in {formatDrawCountdown(msUntilNext)}</p>
        )}
      </div>

      <p className="text-xs text-slate-500">
        The 1,000 and 500 segments are teasers — the pointer never lands there. Wins are added to
        your wallet as bronze (never silver or gold coins).
      </p>

      {/* All results shown in a modal. */}
      {(result !== null || message) && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => {
            setResult(null);
            setMessage(null);
          }}
        >
          <div className="card animate-pop w-full max-w-sm p-8 text-center" onClick={(e) => e.stopPropagation()}>
            {result !== null ? (
              result > 0 ? (
                <>
                  <div className="text-6xl">🎉</div>
                  <h2 className="mt-3 text-2xl font-extrabold text-amber-200">You won {result} bronze!</h2>
                  <p className="mt-2 text-slate-300">
                    Added to your wallet. Come back in {formatDrawCountdown(msUntilNext)} for another spin.
                  </p>
                </>
              ) : (
                <>
                  <div className="text-5xl">🪙</div>
                  <h2 className="mt-3 text-2xl font-extrabold text-slate-200">No coins available</h2>
                  <p className="mt-2 text-slate-300">Insufficient coins this time — better luck on your next spin!</p>
                </>
              )
            ) : (
              <>
                <div className="text-5xl">⏳</div>
                <h2 className="mt-3 text-xl font-bold text-amber-200">Not yet</h2>
                <p className="mt-2 font-mono text-slate-300">{message}</p>
              </>
            )}
            <button
              onClick={() => {
                setResult(null);
                setMessage(null);
              }}
              className="btn-gold mt-5"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
