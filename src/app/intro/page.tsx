"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserProvider";
import { INTRO_PARAGRAPHS } from "@/lib/content";
import { FREE_PLAYS, SIGNUP_WELCOME_BRONZE, dailyReward } from "@/lib/coins";

export default function IntroPage() {
  const { profile, openAuth } = useUser();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
          ◎ About Lucky Coin
        </span>
        <h1 className="mt-3 text-4xl font-extrabold">What is Lucky Coin?</h1>
      </div>

      <div className="card space-y-4 p-6 text-lg leading-relaxed text-slate-200">
        {INTRO_PARAGRAPHS.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="card p-6">
        <h2 className="text-xl font-bold text-amber-200">At a glance</h2>
        <ul className="mt-3 space-y-2 text-slate-300">
          <li>• Try <strong>{FREE_PLAYS} rounds free</strong> before luck asks for your email address.</li>
          <li>• Register for a <strong>{SIGNUP_WELCOME_BRONZE}-bronze welcome bonus</strong> + {dailyReward(1)} bronze on day 1.</li>
          <li>• Jewels appear from <strong>round 2 onward</strong>, bringing bonus turns or extra coins.</li>
          <li>• Spin the <strong>daily prize wheel</strong> and keep your login streak warm.</li>
          <li>• Full rules, odds, and treasure-map fine print live on the <Link href="/help" className="text-amber-300 underline">Help page</Link>.</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => (profile ? router.push("/game") : openAuth())}
          className="btn-gold text-lg !px-7 !py-3"
        >
          {profile ? "▶ Play now" : "Register / Log in"}
        </button>
        <Link href="/help" className="btn-ghost text-lg">
          Read the rules
        </Link>
      </div>
    </div>
  );
}
