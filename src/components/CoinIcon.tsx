import Image from "next/image";
import type { CoinType } from "@/lib/coins";

const SRC: Record<CoinType, string> = {
  gold: "/gold.png",
  silver: "/sylver.png",
  bronze: "/bronze.png",
};

export default function CoinIcon({
  type,
  size = 40,
  className = "",
  responsive = false,
}: {
  type: CoinType;
  size?: number;
  className?: string;
  responsive?: boolean;
}) {
  // Responsive: scale to fill the container (keeping the square aspect), capped
  // at the intrinsic size. Used by the game board so all 50 coins fit one screen.
  if (responsive) {
    return (
      <Image
        src={SRC[type]}
        alt={`${type} coin`}
        width={96}
        height={96}
        className={`h-auto max-h-full w-auto max-w-full object-contain ${className}`}
      />
    );
  }
  return (
    <Image
      src={SRC[type]}
      alt={`${type} coin`}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
