"use client";
import { ReactNode } from "react";
import { baseSepolia } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { WagmiProvider, createConfig, http } from "wagmi";
import { coinbaseWallet, injected, safe } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@coinbase/onchainkit/styles.css";

// Create wagmi config with connectors and custom transport
const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({
      appName: process.env.NEXT_PUBLIC_PROJECT_NAME || "BaseFlip",
      preference: "all",
    }),
    safe(),
  ],
  transports: {
    [baseSepolia.id]: http("https://sepolia.base.org", {
      batch: true,
      timeout: 10000,
    }),
  },
});

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={baseSepolia}
          config={{
            appearance: {
              mode: "dark",
              theme: "base",
            },
            wallet: {
              display: "modal",
              preference: "all",
            },
          }}
          miniKit={{
            enabled: true,
            autoConnect: true,
            notificationProxyUrl: undefined,
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
