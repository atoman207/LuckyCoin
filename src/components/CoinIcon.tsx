import type { CoinType } from "@/lib/coins";

const STYLES: Record<CoinType, { ring: string; face: string; rim: string; mark: string }> = {
  gold: {
    ring: "#a9760f",
    face: "url(#goldFace)",
    rim: "#7a5208",
    mark: "#7a5208",
  },
  silver: {
    ring: "#8a93a6",
    face: "url(#silverFace)",
    rim: "#5b6373",
    mark: "#5b6373",
  },
  bronze: {
    ring: "#8a5a2b",
    face: "url(#bronzeFace)",
    rim: "#5e3c18",
    mark: "#5e3c18",
  },
};

// A small shiny coin with a ★ for gold, ◆ for silver, ● for bronze.
export default function CoinIcon({
  type,
  size = 40,
  className = "",
}: {
  type: CoinType;
  size?: number;
  className?: string;
}) {
  const s = STYLES[type];
  const mark =
    type === "gold" ? "★" : type === "silver" ? "✦" : "●";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={`${type} coin`}
    >
      <defs>
        <radialGradient id="goldFace" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#fff2c2" />
          <stop offset="55%" stopColor="#f5c64a" />
          <stop offset="100%" stopColor="#d9971c" />
        </radialGradient>
        <radialGradient id="silverFace" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#d7dde6" />
          <stop offset="100%" stopColor="#9aa3b2" />
        </radialGradient>
        <radialGradient id="bronzeFace" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#f0c39a" />
          <stop offset="55%" stopColor="#cf8f55" />
          <stop offset="100%" stopColor="#a5662f" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={s.ring} />
      <circle cx="32" cy="32" r="26" fill={s.face} stroke={s.rim} strokeWidth="2" />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="26"
        fill={s.mark}
        opacity="0.85"
      >
        {mark}
      </text>
    </svg>
  );
}
