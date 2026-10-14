"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

export type AdminTab =
  | "dashboard"
  | "users"
  | "payments"
  | "transactions"
  | "sells"
  | "messages"
  | "bots";

const NAV: { id: AdminTab; label: MessageKey }[] = [
  { id: "dashboard", label: "admin.navDashboard" },
  { id: "users", label: "admin.navMembers" },
  { id: "payments", label: "admin.navPayments" },
  { id: "transactions", label: "admin.navTransactions" },
  { id: "sells", label: "admin.navSells" },
  { id: "messages", label: "admin.navMessages" },
  { id: "bots", label: "admin.navBots" },
];

type Props = {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  children: React.ReactNode;
};

export default function AdminShell({ tab, onTabChange, children }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  function go(id: AdminTab) {
    onTabChange(id);
    setOpen(false);
  }

  return (
    <div className="admin-simple flex h-full min-h-0 bg-white text-neutral-800">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 lg:flex">
        <div className="border-b border-neutral-200 px-4 py-4">
          <div className="text-sm font-bold">Lucky Coin</div>
          <div className="text-xs text-neutral-500">{t("admin.shellSubtitle")}</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={`block w-full rounded px-3 py-2 text-left text-sm ${
                tab === item.id
                  ? "bg-neutral-800 font-semibold text-white"
                  : "text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-56 flex-col bg-white">
            <div className="border-b border-neutral-200 px-4 py-4 text-sm font-bold">Lucky Coin</div>
            <nav className="flex-1 space-y-0.5 p-2">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={`block w-full rounded px-3 py-2 text-left text-sm ${
                    tab === item.id ? "bg-neutral-800 font-semibold text-white" : "text-neutral-700"
                  }`}
                >
                  {t(item.label)}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 lg:px-6">
          <button
            type="button"
            className="rounded border border-neutral-300 px-2 py-1 text-sm lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={t("admin.openMenu")}
          >
            Menu
          </button>
          <h1 className="text-base font-bold">
            {t(NAV.find((n) => n.id === tab)?.label ?? "admin.title")}
          </h1>
        </header>
        <main className="flex-1 overflow-auto bg-white p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
