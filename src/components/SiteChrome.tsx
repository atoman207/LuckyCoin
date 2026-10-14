"use client";

import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import AuthModal from "@/components/AuthModal";
import WelcomeModal from "@/components/WelcomeModal";
import VisitTracker from "@/components/VisitTracker";
import ContactWidget from "@/components/ContactWidget";
import BackToTop from "@/components/BackToTop";
import SiteFooter from "@/components/SiteFooter";

/** Public chrome; admin keeps the same Nav header, but skips contact/back-to-top. */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col">
        <VisitTracker />
        <Nav />
        <div className="min-h-0 flex-1">{children}</div>
        <SiteFooter />
        <AuthModal />
        <WelcomeModal />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <VisitTracker />
      <Nav />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
      <AuthModal />
      <WelcomeModal />
      <ContactWidget />
      <BackToTop />
    </div>
  );
}
