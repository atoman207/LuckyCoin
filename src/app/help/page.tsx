"use client";

import Link from "next/link";
import CoinIcon from "@/components/CoinIcon";
import RichText from "@/components/RichText";
import {
  COIN_VALUE,
  ROUND_COST_SILVER,
  ROUND_COST_BRONZE,
  BOARD_SIZE,
  BOARD_COMPOSITION,
  MAX_RESTARTS,
  compositionWithGems,
  SILVER_CAP,
  GEM_TURN_OPTIONS,
  GEM_SILVER_OPTIONS,
  GEM_BRONZE_OPTIONS,
  SIGNUP_WELCOME_BRONZE,
  WHEEL_VALUES,
  WHEEL_BLOCKED,
  FREE_PLAYS,
  COIN_PACKS,
  dailyReward,
  type CoinType,
} from "@/lib/coins";
import { SELL_PRICE_USDT, SELL_HOURS_KEY } from "@/lib/selling";
import { formatUsdAsJpy } from "@/lib/fx-book";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="text-xl font-bold text-amber-700">{title}</h2>
      <div className="mt-3 space-y-2 text-body">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  const { t, intlLocale } = useI18n();

  // Wheel distribution, computed from the live config.
  const wheelCounts = WHEEL_VALUES.reduce<Record<number, number>>((acc, v) => {
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
  const wheelRows = Object.entries(wheelCounts)
    .map(([v, n]) => ({ value: Number(v), count: n }))
    .sort((a, b) => b.value - a.value);

  const coinVals: { type: CoinType; label: MessageKey }[] = [
    { type: "gold", label: "coin.gold" },
    { type: "silver", label: "coin.silver" },
    { type: "bronze", label: "help.bronzeLabel" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">{t("help.title")}</h1>
        <p className="text-muted">
          <RichText k="help.leadPre" />
          <Link href="/intro" className="text-amber-600 underline">
            {t("help.leadLink")}
          </Link>
          {t("help.leadPost")}
        </p>
      </div>

      <Section title={t("help.registerTitle")}>
        <RichText as="p" k="help.registerP1" />
        <RichText
          as="p"
          k="help.registerP2"
          vars={{ welcome: SIGNUP_WELCOME_BRONZE, day1: dailyReward(1) }}
        />
        <RichText as="p" k="help.registerP3" vars={{ plays: FREE_PLAYS }} className="text-sm text-muted" />
      </Section>

      <Section title={t("help.valuesTitle")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {coinVals.map((c) => (
            <div key={c.type} className="flex items-center gap-3 rounded-xl border border-line bg-cream p-4">
              <CoinIcon type={c.type} size={36} />
              <div>
                <div className="font-bold">{t(c.label)}</div>
                <div className="text-sm text-amber-600">
                  {COIN_VALUE[c.type]} {c.type !== "bronze" ? t("help.valueUnit") : t("help.valueBase")}
                </div>
              </div>
            </div>
          ))}
        </div>
        <RichText
          as="p"
          k="help.valuesNote"
          className="text-sm text-muted"
          vars={{
            silver: COIN_VALUE.gold / COIN_VALUE.silver,
            bronze: COIN_VALUE.gold,
            cap: SILVER_CAP.toLocaleString(),
          }}
        />
      </Section>

      <Section title={t("help.playTitle")}>
        <RichText
          as="p"
          k="help.playP1"
          vars={{
            size: BOARD_SIZE,
            gold: BOARD_COMPOSITION.gold,
            silver: BOARD_COMPOSITION.silver,
            bronze: BOARD_COMPOSITION.bronze,
            empty: BOARD_COMPOSITION.empty,
          }}
        />
        <RichText as="p" k="help.playP2" vars={{ silver: ROUND_COST_SILVER, bronze: ROUND_COST_BRONZE }} />
        <RichText as="p" k="help.playP3" vars={{ max: MAX_RESTARTS }} />
        <ul className="ml-5 list-disc text-sm">
          <RichText as="li" k="help.playModeContinuous" />
          <RichText as="li" k="help.playModeMultiplier" vars={{ max: MAX_RESTARTS }} />
        </ul>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-cream text-amber-700">
              <tr>
                <th className="px-3 py-2">{t("help.tableTurn")}</th>
                <th className="px-3 py-2">{t("help.tableGold")}</th>
                <th className="px-3 py-2">{t("help.tableSilver")}</th>
                <th className="px-3 py-2">{t("help.tableBronze")}</th>
                <th className="px-3 py-2">{t("help.tableGems")}</th>
                <th className="px-3 py-2">{t("help.tableBlank")}</th>
              </tr>
            </thead>
            <tbody className="text-body">
              {Array.from({ length: MAX_RESTARTS }, (_, i) => i + 1).map((r) => {
                const c = compositionWithGems("multiplier", r);
                const gem = c.gem ?? 0;
                const blank = BOARD_SIZE - c.gold - c.silver - c.bronze - gem;
                return (
                  <tr key={r} className="border-t border-line">
                    <td className="px-3 py-1.5 font-semibold text-amber-800">{r}</td>
                    <td className="px-3 py-1.5">{c.gold}</td>
                    <td className="px-3 py-1.5">{c.silver}</td>
                    <td className="px-3 py-1.5">{c.bronze}</td>
                    <td className="px-3 py-1.5 text-violet-600">{gem}</td>
                    <td className="px-3 py-1.5">{blank}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={t("help.gemsTitle")}>
        <RichText as="p" k="help.gemsP1" />
        <RichText as="p" k="help.gemsP2" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div className="font-bold text-violet-700">{t("help.gemsFreeTurns")}</div>
            <RichText
              as="div"
              className="mt-1 text-sm"
              k="help.gemsFreeTurnsBody"
              vars={{ options: GEM_TURN_OPTIONS.join(", +") }}
            />
          </div>
          <div className="rounded-xl border border-line bg-cream p-4">
            <div className="font-bold text-body">{t("help.gemsSilver")}</div>
            <RichText
              as="div"
              className="mt-1 text-sm"
              k="help.gemsSilverBody"
              vars={{ options: GEM_SILVER_OPTIONS.join(", +") }}
            />
          </div>
          <div className="rounded-xl border border-line bg-cream p-4">
            <div className="font-bold text-orange-700">{t("help.gemsBronze")}</div>
            <RichText
              as="div"
              className="mt-1 text-sm"
              k="help.gemsBronzeBody"
              vars={{ options: GEM_BRONZE_OPTIONS.map((n) => n.toLocaleString()).join(", +") }}
            />
          </div>
        </div>
        <RichText as="p" k="help.gemsExample" className="text-sm text-muted" />
      </Section>

      <Section title={t("help.dailyTitle")}>
        <p>{t("help.dailyBody")}</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <span key={d} className="rounded-lg border border-line bg-cream px-2.5 py-1">
              {t("help.dailyDay", { day: d })}
              <strong className="text-amber-600">{dailyReward(d)}</strong> {t("help.dailyBronze")}
            </span>
          ))}
        </div>
      </Section>

      <Section title={t("help.wheelTitle")}>
        <p>
          {t("help.wheelBodyPre")}
          <Link href="/draw" className="text-amber-600 underline">
            {t("help.wheelBodyLink")}
          </Link>
          <RichText
            k="help.wheelBodyPost"
            vars={{ segments: WHEEL_VALUES.length, blocked: WHEEL_BLOCKED.join(" / ") }}
          />
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {wheelRows.map((r) => (
            <span
              key={r.value}
              className={`rounded-lg border px-2.5 py-1 ${
                WHEEL_BLOCKED.includes(r.value)
                  ? "border-amber-300 bg-amber-50 text-amber-600"
                  : "border-line bg-cream"
              }`}
            >
              {r.count}× <strong>{r.value}</strong>
            </span>
          ))}
        </div>
      </Section>

      <Section title={t("help.tradeTitle")}>
        <RichText as="p" k="help.tradeExchange" />
        <RichText
          as="p"
          k="help.tradeBuy"
          vars={{
            packs: COIN_PACKS.map(
              (p) => `シルバー ${p.silver} 枚 / ${formatUsdAsJpy(p.usd, intlLocale)}`
            ).join("、"),
          }}
        />
        <RichText
          as="p"
          k="help.tradeSell"
          vars={{ price: SELL_PRICE_USDT.toLocaleString(), hours: t(SELL_HOURS_KEY) }}
        />
      </Section>

      <Section title={t("help.fairTitle")}>
        <p className="text-sm text-muted">{t("help.fairBody")}</p>
      </Section>
    </div>
  );
}
