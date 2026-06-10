"use client";

import Link from "next/link";
import { useUser } from "@/components/UserProvider";

// First-login reward shortcuts shown in the header until the member claims
// their rewards. Three coin-coloured, animated buttons. Labels collapse to
// icons on small screens so they sit neatly in the top-right on mobile.
export default function FirstLoginButtons() {
  const { profile } = useUser();
  if (!profile || profile.rewards_claimed) return null;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Link href="/claim" className="btn-gold btn-attn !px-3 !py-1.5 text-sm" title="Claim Rewards">
        🎁<span className="hidden md:inline"> Claim</span>
      </Link>
      <Link href="/draw" className="btn-silver btn-attn !px-3 !py-1.5 text-sm" title="Lottery">
        🎰<span className="hidden md:inline"> Lottery</span>
      </Link>
      <Link href="/help" className="btn-bronze btn-attn !px-3 !py-1.5 text-sm" title="Help">
        ❓<span className="hidden md:inline"> Help</span>
      </Link>
    </div>
  );
}
