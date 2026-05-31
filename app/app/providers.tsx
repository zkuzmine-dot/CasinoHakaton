"use client";

import React, { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

// Cast to avoid React 18 / wallet-adapter FC type mismatch
const Conn = ConnectionProvider as unknown as React.FC<{
  endpoint: string;
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
  const endpoint = useMemo(() => "https://api.devnet.solana.com", []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <Conn endpoint={endpoint}>
      <WalletProv wallets={wallets} autoConnect>
        <ModalProv>{children}</ModalProv>
      </WalletProv>
    </Conn>
  );
}
