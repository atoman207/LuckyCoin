import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/components/UserProvider";
import Nav from "@/components/Nav";
import AuthModal from "@/components/AuthModal";

export const metadata: Metadata = {
  title: "Lucky Coin — Next",
  description: "Pick the lucky coin. Crack it open. Win gold, silver and bronze.",
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
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
          <AuthModal />
          <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-slate-500">
            © {new Date().getFullYear()} Lucky Coin · Play responsibly.
          </footer>
        </UserProvider>
      </body>
    </html>
  );
}
