"use client";

import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinIcon from "@/components/CoinIcon";
import { SIGNUP_WELCOME_BRONZE, dailyReward } from "@/lib/coins";
import { useI18n } from "@/lib/i18n/provider";

export default function ClaimPage() {
  const { profile, loading, openAuth, setProfile } = useUser();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !profile) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">{t("claim.loginTitle")}</h1>
        <button onClick={openAuth} className="btn-gold mt-6">{t("common.loginRegister")}</button>
      </div>
    );
  }
  if (loading || !profile) return <div className="py-20 text-center text-muted">{t("common.loading")}</div>;

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
      setDone(data.claimed ? data.message : t("claim.alreadyClaimed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("claim.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">{t("claim.title")}</h1>
        <p className="text-muted">{t("claim.subtitle")}</p>
      </div>

      {done && (
        <div className="card animate-pop border-emerald-300 bg-emerald-50 px-4 py-3 text-center font-semibold text-emerald-700">
          ✓ {done}
        </div>
      )}
      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-center text-red-600">{error}</div>}

      {/* Rules table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-cream text-muted">
            <tr>
              <th className="px-4 py-3">{t("claim.reward")}</th>
              <th className="px-4 py-3">{t("claim.when")}</th>
              <th className="px-4 py-3 text-right">{t("claim.bronze")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="px-4 py-3 font-semibold">{t("claim.signupBonus")}</td>
              <td className="px-4 py-3 text-body">{t("claim.signupWhen")}</td>
              <td className="px-4 py-3 text-right font-bold text-amber-600">{SIGNUP_WELCOME_BRONZE}</td>
            </tr>
            {dailyDays.map((d) => (
              <tr key={d} className="border-b border-line">
                <td className="px-4 py-3 font-semibold">
                  {t("claim.dailyReward")}{" "}
                  {d === 1 && <span className="text-xs text-emerald-600">{t("claim.includedFirst")}</span>}
                </td>
                <td className="px-4 py-3 text-body">
                  {t("claim.dailyWhen", { day: `${d}${d === 7 ? "+" : ""}` })}
                </td>
                <td className="px-4 py-3 text-right font-bold text-amber-600">{dailyReward(d)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-cream">
              <td className="px-4 py-3 font-bold" colSpan={2}>
                {t("claim.firstTotal")}
              </td>
              <td className="px-4 py-3 text-right font-extrabold text-emerald-600">
                {SIGNUP_WELCOME_BRONZE + dailyReward(1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-faint">{t("claim.note")}</p>

      <div className="card flex flex-col items-center gap-3 p-6 text-center">
        <CoinIcon type="bronze" size={48} className="animate-pop" />
        {claimed ? (
          <p className="text-lg font-semibold text-emerald-700">{t("claim.already")}</p>
        ) : (
          <>
            <p className="text-body">
              {t("claim.claimNowPre")}
              <strong className="text-amber-600">
                {t("claim.claimNowStrong", { amount: SIGNUP_WELCOME_BRONZE + dailyReward(1) })}
              </strong>
              {t("claim.claimNowPost")}
            </p>
            <button onClick={claim} disabled={busy} className="btn-gold text-lg !px-8 !py-3">
              {busy ? t("claim.claiming") : t("claim.action")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
