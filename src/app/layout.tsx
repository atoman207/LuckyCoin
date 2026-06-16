import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/components/UserProvider";
import Nav from "@/components/Nav";
import AuthModal from "@/components/AuthModal";
import WelcomeModal from "@/components/WelcomeModal";
import VisitTracker from "@/components/VisitTracker";
import ContactWidget from "@/components/ContactWidget";
import BackToTop from "@/components/BackToTop";

export const metadata: Metadata = {
  metadataBase: new URL("https://luckybronzecoin.com"),
  title: {
    default: "Lucky Coin Game | Get Your Lucky Coin Before Starting the Day",
    template: "%s | Lucky Coin Game",
  },
  description:
    "Grab a Lucky Coin before starting your day, because even your coffee deserves a backup plan for good fortune and smooth sailing.",
  keywords: [
    "Lucky Coin",
    "lucky coin game",
    "online coin game",
    "daily luck game",
    "good luck game",
    "morning lucky coin",
    "pick a lucky coin",
    "coin rewards game",
    "gold silver bronze coin game",
  ],
  applicationName: "Lucky Coin",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Lucky Coin Game | Get Your Lucky Coin Before Starting the Day",
    description:
      "Grab a Lucky Coin before starting your day, because even your coffee deserves a backup plan for good fortune and smooth sailing.",
    url: "/",
    siteName: "Lucky Coin",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "Lucky Coin Game | Get Your Lucky Coin Before Starting the Day",
    description:
      "Grab a Lucky Coin before starting your day, because even your coffee deserves a backup plan for good fortune and smooth sailing.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <UserProvider>
          <VisitTracker />
          <Nav />
          <main className="mx-auto w-full max-w-[1280px] px-4 py-8">{children}</main>
          <AuthModal />
          <WelcomeModal />
          <ContactWidget />
          <BackToTop />
          <footer className="mx-auto hidden max-w-6xl px-4 py-10 text-center text-sm text-slate-500 sm:block">
            © {new Date().getFullYear()} Lucky Coin · Play responsibly.
          </footer>
        </UserProvider>
      </body>
    </html>
  );
}
