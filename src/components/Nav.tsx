"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinBalance from "@/components/CoinBalance";
import Avatar from "@/components/Avatar";
import FirstLoginButtons from "@/components/FirstLoginButtons";

// Always visible in the top bar (desktop).
const NAV_LINKS = [
  { href: "/game", label: "Play" },
  { href: "/draw", label: "Wheel" },
];

// Moved into the avatar dropdown menu.
const MENU_LINKS = [
  { href: "/buy", label: "Buy" },
  { href: "/sell", label: "Sell" },
  { href: "/exchange", label: "Exchange" },
];

const HELP_HREF = "/help";

export default function Nav() {
  const { profile, loading, openAuth, signOut } = useUser();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);

  const topLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        pathname === href
          ? "bg-white/10 text-white"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/logo.png"
            alt="Lucky Coin"
            width={200}
            height={56}
            className="h-10 w-auto sm:h-11"
            priority
          />
        </Link>

        {profile && (
          <div className="ml-2 hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((l) => topLink(l.href, l.label))}
            {/* Help is shown as a question-mark icon. */}
            <Link
              href={HELP_HREF}
              aria-label="Help"
              title="Help & rules"
              className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold transition ${
                pathname === HELP_HREF
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              ?
            </Link>
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

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {loading ? null : profile ? (
            <>
              <FirstLoginButtons />
              {/* Mobile: icons only, quantity in a hover/tap tooltip. */}
              <div className="sm:hidden">
                <CoinBalance profile={profile} compact size={24} />
              </div>
              {/* Desktop: full chips with the number. */}
              <div className="hidden sm:block">
                <CoinBalance profile={profile} />
              </div>
              <div
                className="relative"
                onMouseEnter={() => setMenu(true)}
                onMouseLeave={() => setMenu(false)}
              >
                <button
                  onClick={() => setMenu((m) => !m)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-sm hover:bg-white/10"
                >
                  <Avatar src={profile.avatar_url} name={profile.nickname} size={26} />
                  <span className="hidden max-w-[10ch] truncate sm:inline">{profile.nickname}</span>
                </button>
                {menu && (
                  <div className="absolute right-0 top-full w-48 pt-2">
                   <div className="overflow-hidden rounded-xl border border-white/10 bg-[#121829] shadow-xl">
                    {/* Mobile-only: coin balance + the top-bar links. */}
                    <div className="px-3 py-2 sm:hidden">
                      <CoinBalance profile={profile} />
                    </div>
                    <div className="flex flex-col border-b border-white/10 sm:hidden">
                      {NAV_LINKS.map((l) => (
                        <Link key={l.href} href={l.href} onClick={() => setMenu(false)} className="px-3 py-2 text-sm hover:bg-white/5">
                          {l.label}
                        </Link>
                      ))}
                      <Link href={HELP_HREF} onClick={() => setMenu(false)} className="px-3 py-2 text-sm hover:bg-white/5">
                        Help
                      </Link>
                      {profile.is_admin && (
                        <Link href="/admin" onClick={() => setMenu(false)} className="px-3 py-2 text-sm text-amber-300 hover:bg-white/5">
                          Admin
                        </Link>
                      )}
                    </div>

                    {/* Buy / Sell / Exchange — all screen sizes. */}
                    <div className="flex flex-col">
                      {MENU_LINKS.map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          onClick={() => setMenu(false)}
                          className={`px-3 py-2 text-sm hover:bg-white/5 ${
                            pathname === l.href ? "bg-white/10 text-white" : ""
                          }`}
                        >
                          {l.label}
                        </Link>
                      ))}
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
