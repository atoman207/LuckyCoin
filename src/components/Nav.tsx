"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinBalance from "@/components/CoinBalance";
import Avatar from "@/components/Avatar";
import FirstLoginButtons from "@/components/FirstLoginButtons";

// Shop links live in the avatar dropdown menu.
const MENU_LINKS = [
  { href: "/buy", label: "Buy" },
  { href: "/sell", label: "Sell" },
  { href: "/exchange", label: "Exchange" },
];

export default function Nav() {
  const { profile, loading, openAuth, signOut } = useUser();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black backdrop-blur">
      {/* Fixed-height bar (taller on PC). Full width with ~5vw side margins. */}
      <nav className="flex h-[var(--header-h)] items-center gap-3 px-[5vw]">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/logo.png"
            alt="Lucky Coin"
            width={200}
            height={56}
            className="h-10 w-auto sm:h-11 lg:h-14"
            priority
          />
        </Link>

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
                      {/* Mobile-only coin balance. */}
                      <div className="border-b border-white/10 px-3 py-2 sm:hidden">
                        <CoinBalance profile={profile} />
                      </div>

                      {/* Buy / Sell / Exchange. */}
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

                      {profile.is_admin && (
                        <Link
                          href="/admin"
                          onClick={() => setMenu(false)}
                          className="block border-t border-white/10 px-3 py-2 text-sm text-amber-300 hover:bg-white/5"
                        >
                          Admin
                        </Link>
                      )}
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
