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
}: {
  type: CoinType;
  size?: number;
  className?: string;
}) {
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
