import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletContextProvider } from "./providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crash.SOL — Provably Fair Casino on Solana",
  description:
    "Play provably fair Crash on Solana Devnet. All randomness verified on-chain via VRF commit-reveal. No house servers.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="font-sans antialiased bg-[#0d0f14] text-white">
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
