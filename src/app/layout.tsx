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
import { createTranslator } from "@/lib/i18n";
import { HTML_LANG } from "@/lib/i18n/config";

// 日本語専用サイトなので、メタデータは常に日本語です。
export function generateMetadata(): Metadata {
  const t = createTranslator();
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
      locale: "ja_JP",
    },
    twitter: { card: "summary", title, description },
    robots: { index: true, follow: true },
    icons: { icon: "/favicon.png", apple: "/favicon.png" },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={HTML_LANG}>
      <head>
        {/*
          本文フォントは「M PLUS Rounded 1c」— 日本でいちばん定番の丸ゴシックで、
          子供向け・親しみやすさを狙うサイトで広く使われている書体です。

          next/font ではなく <link> で読み込んでいるのは、日本語フォントが
          非常に大きいためです。Google Fonts の CSS は unicode-range で
          細かく分割されており、ブラウザは実際に使う字だけを取得します。
          next/font はビルド時に全サブセット（数百ファイル）を取得して
          自前配信するため、ビルドが重く壊れやすくなります。
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <LanguageProvider>
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
