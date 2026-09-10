"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/UserProvider";
import CoinBalance from "@/components/CoinBalance";
import Avatar from "@/components/Avatar";
import FirstLoginButtons from "@/components/FirstLoginButtons";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

// Shop links live in the avatar dropdown menu.
const MENU_LINKS: { href: string; label: MessageKey }[] = [
  { href: "/buy", label: "nav.buy" },
  { href: "/sell", label: "nav.sell" },
  { href: "/exchange", label: "nav.exchange" },
];

export default function Nav() {
  const { profile, loading, openAuth, signOut } = useUser();
  const { t } = useI18n();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/55 backdrop-blur-md">
      {/* Fixed-height bar (taller on PC). Full width with ~5vw side margins. */}
      <nav className="flex h-[var(--header-h)] items-center gap-3 px-[5vw]">
        {/* ロゴ画像 (public/logo.png) は「黒背景に金文字」で、背景が透過して
            いません。ヘッダーを白にしたため、そのまま置くと白地に黒い四角が
            浮いて見えます。暫定として黒いプレートに載せ、ロゴの背景と地続きに
            見えるようにしています。
            背景透過（または明るい地）のロゴに差し替えたら、この <span> の
            プレート指定を外して <Image> を直接置いてください。 */}
        <Link href="/" className="flex shrink-0 items-center">
          <span className="inline-flex items-center rounded-lg bg-black px-2 py-0.5 sm:px-2.5">
            <Image
              src="/logo.png"
              alt="Lucky Coin"
              width={200}
              height={56}
              className="h-7 w-auto sm:h-8 lg:h-9"
              priority
            />
          </span>
        </Link>

        {/* Public rankings / notice board — visible to everyone. */}
        <Link
          href="/notice"
          className={`ml-3 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition hover:bg-sand ${
            pathname === "/notice" ? "bg-sand text-amber-600" : "text-body"
          }`}
        >
          <span aria-hidden>🏆</span> <span className="hidden sm:inline">{t("nav.rankings")}</span>
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
                  className="flex items-center gap-2 rounded-xl border border-line bg-cream px-2 py-1 text-sm hover:bg-sand"
                >
                  <Avatar src={profile.avatar_url} name={profile.nickname} size={26} />
                  <span className="hidden max-w-[10ch] truncate sm:inline">{profile.nickname}</span>
                </button>
                {menu && (
                  <div className="absolute right-0 top-full w-48 pt-2">
                    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-xl">
                      {/* Mobile-only coin balance. */}
                      <div className="border-b border-line px-3 py-2 sm:hidden">
                        <CoinBalance profile={profile} />
                      </div>

                      {/* Buy / Sell / Exchange. */}
                      <div className="flex flex-col">
                        {MENU_LINKS.map((l) => (
                          <Link
                            key={l.href}
                            href={l.href}
                            onClick={() => setMenu(false)}
                            className={`px-3 py-2 text-sm hover:bg-cream ${
                              pathname === l.href ? "bg-sand text-body" : ""
                            }`}
                          >
                            {t(l.label)}
                          </Link>
                        ))}
                      </div>

                      {profile.is_admin && (
                        <Link
                          href="/admin"
                          onClick={() => setMenu(false)}
                          className="block border-t border-line px-3 py-2 text-sm text-amber-600 hover:bg-cream"
                        >
                          {t("nav.admin")}
                        </Link>
                      )}
                      <Link
                        href="/profile"
                        onClick={() => setMenu(false)}
                        className="block border-t border-line px-3 py-2 text-sm hover:bg-cream"
                      >
                        {t("nav.profile")}
                      </Link>
                      <button
                        onClick={() => {
                          setMenu(false);
                          signOut();
                        }}
                        className="w-full border-t border-line px-3 py-2 text-left text-sm text-red-600 hover:bg-cream"
                      >
                        {t("nav.signOut")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={openAuth} className="btn-gold !px-4 !py-2 text-sm">
              {t("common.login")}
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
