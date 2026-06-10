"use client";

import { WHEEL_BLOCKED } from "@/lib/coins";

const N = 20;
const SEG = 360 / N; // 18°
const R = 150;
const CX = 160;
const CY = 160;

// Point on the circle at `angle` degrees, measured clockwise from the top.
function pt(angle: number, radius: number): [number, number] {
  const a = (angle * Math.PI) / 180;
  return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)];
}

export default function PrizeWheel({
  layout,
  rotation,
  spinning,
  spinMs,
}: {
  layout: number[];
  rotation: number;
  spinning: boolean;
  spinMs: number;
}) {
  return (
    <div className="relative mx-auto" style={{ width: 320, height: 320 }}>
      {/* Pointer (fixed at top) */}
      <div
        className="absolute left-1/2 z-10 -translate-x-1/2"
        style={{
          top: -2,
          width: 0,
          height: 0,
          borderLeft: "12px solid transparent",
          borderRight: "12px solid transparent",
          borderTop: "22px solid #f5b73d",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))",
        }}
      />
      <svg
        viewBox="0 0 320 320"
        width="320"
        height="320"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? `transform ${spinMs}ms cubic-bezier(0.16, 0.84, 0.27, 1)` : "none",
        }}
      >
        {layout.map((v, i) => {
          const start = i * SEG - SEG / 2;
          const end = i * SEG + SEG / 2;
          const [x1, y1] = pt(start, R);
          const [x2, y2] = pt(end, R);
          const [lx, ly] = pt(i * SEG, R * 0.66);
          const blocked = WHEEL_BLOCKED.includes(v);
          const fill = blocked ? "#3a2d12" : i % 2 ? "#1b2440" : "#28335a";
          return (
            <g key={i}>
              <path
                d={`M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} Z`}
                fill={fill}
                stroke="#0b0f1a"
                strokeWidth="1"
              />
              <text
                x={lx}
                y={ly}
                fill={blocked ? "#f5b73d" : "#e7ecf5"}
                fontSize="13"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${i * SEG} ${lx} ${ly})`}
              >
                {v}
              </text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r="24" fill="#0b0f1a" stroke="#f5b73d" strokeWidth="3" />
      </svg>
    </div>
  );
}
