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
import { useI18n } from "@/lib/i18n/provider";

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
  const { t } = useI18n();
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
        <h1 className="text-2xl font-bold">{t("draw.loginTitle")}</h1>
        <p className="mt-2 text-body">{t("draw.loginBody")}</p>
        <button onClick={openAuth} className="btn-gold mt-6">{t("common.loginRegister")}</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-muted">{t("common.loading")}</div>;

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
      setMessage(e instanceof Error ? e.message : t("draw.failed"));
      setSpinning(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <div>
        <h1 className="text-3xl font-extrabold">{t("draw.title")}</h1>
        <p className="text-muted">{t("draw.subtitle")}</p>
      </div>

      <PrizeWheel layout={layout} rotation={rotation} spinning={spinning} spinMs={WHEEL_SPIN_MS} />

      <div className="space-y-2">
        <button
          onClick={spin}
          disabled={spinning || !canSpinNow}
          className="btn-gold text-lg !px-10 !py-3 font-mono tabular-nums"
        >
          {spinning ? t("draw.spinning") : canSpinNow ? t("draw.start") : formatDrawCountdown(msUntilNext)}
        </button>

      </div>

      <p className="text-xs text-faint">{t("draw.note")}</p>

      {/* All results shown in a modal. */}
      {(result !== null || message) && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#4a3f31]/35 p-4 backdrop-blur-sm"
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
                  <h2 className="mt-3 text-2xl font-extrabold text-amber-700">
                    {t("draw.wonTitle", { value: result })}
                  </h2>
                  <p className="mt-2 text-body">
                    {t("draw.wonBody", { time: formatDrawCountdown(msUntilNext) })}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-5xl">🪙</div>
                  <h2 className="mt-3 text-2xl font-extrabold text-body">{t("draw.noCoinsTitle")}</h2>
                  <p className="mt-2 text-body">{t("draw.noCoinsBody")}</p>
                </>
              )
            ) : (
              <>
                <div className="text-5xl">⏳</div>
                <h2 className="mt-3 text-xl font-bold text-amber-700">{t("draw.notYetTitle")}</h2>
                <p className="mt-2 font-mono text-body">{message}</p>
              </>
            )}
            <button
              onClick={() => {
                setResult(null);
                setMessage(null);
              }}
              className="btn-gold mt-5"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
