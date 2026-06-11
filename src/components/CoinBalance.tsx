"use client";

import CoinIcon from "@/components/CoinIcon";
import type { Profile } from "@/lib/coins";

// Balance display: gold / silver / bronze.
//  • default — chips showing the icon + the number.
//  • compact — icons only (for the cramped mobile header); the quantity shows
//    in a tooltip below the coin on hover/focus/tap.
export default function CoinBalance({
  profile,
  size = 22,
  compact = false,
}: {
  profile: Pick<Profile, "gold" | "silver" | "bronze">;
  size?: number;
  compact?: boolean;
}) {
  const items = [
    { type: "gold" as const, value: profile.gold },
    { type: "silver" as const, value: profile.silver },
    { type: "bronze" as const, value: profile.bronze },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {items.map((it) => (
          <span key={it.type} tabIndex={0} className="group relative flex items-center outline-none">
            <CoinIcon type={it.type} size={size} />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#121829] px-2 py-1 text-xs font-semibold capitalize tabular-nums opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100 group-active:opacity-100"
            >
              {it.value.toLocaleString()} {it.type}
            </span>
          </span>
        ))}
      </div>
    );
  }

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
