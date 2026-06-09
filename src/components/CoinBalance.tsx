"use client";

import CoinIcon from "@/components/CoinIcon";
import type { Profile } from "@/lib/coins";

// Compact balance chips: gold / silver / bronze.
export default function CoinBalance({
  profile,
  size = 22,
}: {
  profile: Pick<Profile, "gold" | "silver" | "bronze">;
  size?: number;
}) {
  const items = [
    { type: "gold" as const, value: profile.gold },
    { type: "silver" as const, value: profile.silver },
    { type: "bronze" as const, value: profile.bronze },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {items.map((it) => (
        <span
          key={it.type}
          className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-sm font-semibold tabular-nums"
          title={`${it.value} ${it.type}`}
        >
          <CoinIcon type={it.type} size={size} />
          {it.value.toLocaleString()}
        </span>
      ))}
    </div>
  );
}
