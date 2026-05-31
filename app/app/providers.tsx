"use client";

import React, { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

// Cast to avoid React 18 / wallet-adapter FC type mismatch
const Conn = ConnectionProvider as unknown as React.FC<{
  endpoint: string;
  config?: { disableRetryOnRateLimit?: boolean; commitment?: string };
  children: ReactNode;
}>;
const WalletProv = WalletProvider as unknown as React.FC<{
  wallets: PhantomWalletAdapter[];
  autoConnect?: boolean;
  children: ReactNode;
}>;
const ModalProv = WalletModalProvider as unknown as React.FC<{
  children: ReactNode;
}>;

interface Props {
  children: ReactNode;
}

export function WalletContextProvider({ children }: Props) {
  const endpoint = useMemo(() => {
    const key = process.env.NEXT_PUBLIC_HELIUS_KEY;
    return key
      ? `https://devnet.helius-rpc.com/?api-key=${key}`
      : "https://api.devnet.solana.com";
  }, []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  // TODO: replace endpoint with Helius devnet key to avoid rate limits
  const config = useMemo(() => ({ disableRetryOnRateLimit: true, commitment: "confirmed" }), []);

  return (
    <Conn endpoint={endpoint} config={config}>
      <WalletProv wallets={wallets} autoConnect>
        <ModalProv>{children}</ModalProv>
      </WalletProv>
    </Conn>
  );
}
