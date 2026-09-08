import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/components/UserProvider";
import Nav from "@/components/Nav";
import AuthModal from "@/components/AuthModal";
import WelcomeModal from "@/components/WelcomeModal";
import VisitTracker from "@/components/VisitTracker";
import ContactWidget from "@/components/ContactWidget";
import BackToTop from "@/components/BackToTop";
import SiteFooter from "@/components/SiteFooter";
import { LanguageProvider } from "@/lib/i18n/provider";
import { getLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n";
import { HTML_LANG } from "@/lib/i18n/config";

// Metadata follows the visitor's language cookie (Japanese by default).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const title = t("meta.title");
  const description = t("meta.description");

  return {
    metadataBase: new URL("https://luckybronzecoin.com"),
    title: {
      default: title,
      template: t("meta.titleTemplate"),
    },
    description,
    keywords: t("meta.keywords").split(","),
    applicationName: "Lucky Coin",
    alternates: { canonical: "/" },
    openGraph: {
      title,
      description,
      url: "/",
      siteName: "Lucky Coin",
      type: "website",
      locale: locale === "ja" ? "ja_JP" : "en_US",
    },
    twitter: { card: "summary", title, description },
    robots: { index: true, follow: true },
    icons: { icon: "/favicon.png", apple: "/favicon.png" },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={HTML_LANG[locale]}>
      <body className="min-h-screen">
        <LanguageProvider initialLocale={locale}>
          <UserProvider>
            <VisitTracker />
            <Nav />
            <main className="mx-auto w-full max-w-[1280px] px-4 py-8">{children}</main>
            <AuthModal />
            <WelcomeModal />
            <ContactWidget />
            <BackToTop />
            <SiteFooter />
          </UserProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
