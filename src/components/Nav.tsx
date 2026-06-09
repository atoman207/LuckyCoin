"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinBalance from "@/components/CoinBalance";
import Avatar from "@/components/Avatar";

const LINKS = [
  { href: "/game", label: "Play" },
  { href: "/buy", label: "Buy" },
  { href: "/exchange", label: "Exchange" },
];

export default function Nav() {
  const { profile, loading, openAuth, signOut } = useUser();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0f1a]/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-b from-amber-300 to-amber-500 text-slate-900">
            ◎
          </span>
          <span className="text-lg">
            Lucky<span className="text-amber-400">Coin</span>
          </span>
        </Link>

        {profile && (
          <div className="ml-2 hidden items-center gap-1 sm:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  pathname === l.href
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {profile.is_admin && (
              <Link
                href="/admin"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  pathname === "/admin" ? "bg-white/10 text-white" : "text-amber-300 hover:bg-white/5"
                }`}
              >
                Admin
              </Link>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {loading ? null : profile ? (
            <>
              <div className="hidden sm:block">
                <CoinBalance profile={profile} />
              </div>
              <div className="relative">
                <button
                  onClick={() => setMenu((m) => !m)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-sm hover:bg-white/10"
                >
                  <Avatar src={profile.avatar_url} name={profile.nickname} size={26} />
                  <span className="hidden max-w-[10ch] truncate sm:inline">{profile.nickname}</span>
                </button>
                {menu && (
                  <div
                    className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#121829] shadow-xl"
                    onMouseLeave={() => setMenu(false)}
                  >
                    <div className="px-3 py-2 sm:hidden">
                      <CoinBalance profile={profile} />
                    </div>
                    <div className="flex flex-col sm:hidden">
                      {LINKS.map((l) => (
                        <Link key={l.href} href={l.href} onClick={() => setMenu(false)} className="px-3 py-2 text-sm hover:bg-white/5">
                          {l.label}
                        </Link>
                      ))}
                      {profile.is_admin && (
                        <Link href="/admin" onClick={() => setMenu(false)} className="px-3 py-2 text-sm text-amber-300 hover:bg-white/5">
                          Admin
                        </Link>
                      )}
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setMenu(false)}
                      className="block border-t border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                    >
                      Profile
                    </Link>
                    <button
                      onClick={() => {
                        setMenu(false);
                        signOut();
                      }}
                      className="w-full border-t border-white/10 px-3 py-2 text-left text-sm text-red-300 hover:bg-white/5"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={openAuth} className="btn-gold !px-4 !py-2 text-sm">
              Log in
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
