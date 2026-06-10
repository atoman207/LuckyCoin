"use client";

import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import { SIGNUP_WELCOME_BRONZE, dailyReward } from "@/lib/coins";

export default function ClaimPage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Log in to claim rewards</h1>
        <button onClick={openAuth} className="btn-gold mt-6">Log in / Register</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-slate-400">Loading…</div>;

  const claimed = !!profile.rewards_claimed;
  const dailyDays = [1, 2, 3, 4, 5, 6, 7];

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/claim", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.profile) setProfile(data.profile);
      setDone(data.claimed ? data.message : "Rewards already claimed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Claim your rewards</h1>
        <p className="text-slate-400">
          New accounts start at 0 coins. Claim your sign-up bonus and day-1 daily reward to begin.
        </p>
      </div>

      {done && (
        <div className="card animate-pop border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-center font-semibold text-emerald-100">
          ✓ {done}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-500/15 px-4 py-3 text-center text-red-300">{error}</div>}

      {/* Rules table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-black/20 text-slate-400">
            <tr>
              <th className="px-4 py-3">Reward</th>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3 text-right">Bronze</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/5">
              <td className="px-4 py-3 font-semibold">Sign-up bonus</td>
              <td className="px-4 py-3 text-slate-300">Once, on your first claim</td>
              <td className="px-4 py-3 text-right font-bold text-amber-300">{SIGNUP_WELCOME_BRONZE}</td>
            </tr>
            {dailyDays.map((d) => (
              <tr key={d} className="border-b border-white/5">
                <td className="px-4 py-3 font-semibold">
                  Daily reward {d === 1 && <span className="text-xs text-emerald-300">(included on first claim)</span>}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  Day {d}
                  {d === 7 ? "+" : ""} of your login streak
                </td>
                <td className="px-4 py-3 text-right font-bold text-amber-300">{dailyReward(d)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-black/20">
              <td className="px-4 py-3 font-bold" colSpan={2}>
                First claim total (sign-up + day 1)
              </td>
              <td className="px-4 py-3 text-right font-extrabold text-emerald-300">
                {SIGNUP_WELCOME_BRONZE + dailyReward(1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        After the first claim, the daily reward is granted automatically once every 24 hours. Missing
        a day resets the streak to day 1.
      </p>

      <div className="card flex flex-col items-center gap-3 p-6 text-center">
        <CoinIcon type="bronze" size={48} className="animate-pop" />
        {claimed ? (
          <p className="text-lg font-semibold text-emerald-200">You&apos;ve already claimed your rewards. 🎉</p>
        ) : (
          <>
            <p className="text-slate-300">
              Claim <strong className="text-amber-300">{SIGNUP_WELCOME_BRONZE + dailyReward(1)} bronze</strong> now.
            </p>
            <button onClick={claim} disabled={busy} className="btn-gold text-lg !px-8 !py-3">
              {busy ? "Claiming…" : "🎁 Claim Rewards"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
