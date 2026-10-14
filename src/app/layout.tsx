import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/components/UserProvider";
import SiteChrome from "@/components/SiteChrome";
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
          本文フォントは「Zen Maru Gothic」— 絵本や子供向け教材でよく見る、
          角のない太めの丸ゴシックです。本文は Medium(500)、見出しは Bold(700)、
          ボタンは Black(900) を使います（800 はこの書体に無く、900 で描かれます）。

          next/font ではなく <link> で読み込んでいるのは、日本語フォントが
          非常に大きいためです。Google Fonts の CSS は unicode-range で
          細かく分割されており、ブラウザは実際に使う字だけを取得します。
          next/font はビルド時に全サブセット（数百ファイル）を取得して
          自前配信するため、ビルドが重く壊れやすくなります。
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <LanguageProvider>
          <UserProvider>
            <SiteChrome>{children}</SiteChrome>
          </UserProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
