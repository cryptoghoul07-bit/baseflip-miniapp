"use client";
import { useState, useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect
} from "@coinbase/onchainkit/wallet";
import {
  Address,
  Avatar,
  Name,
  Identity,
} from "@coinbase/onchainkit/identity";
import { useAccount } from "wagmi";
import { useBaseFlip } from "./hooks/useBaseFlip";
import LevelSelector from "./components/LevelSelector";
import PoolDisplay from "./components/PoolDisplay";
import StakeInput from "./components/StakeInput";
import WinnersFeed from "./components/WinnersFeed";
import AdminPanel from "./components/AdminPanel";
import WelcomeModal from "./components/WelcomeModal/WelcomeModal";
import styles from "./page.module.css";

export default function Home() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const {
    roundData,
    userStake,
    stake,
    isStaking,
    refetchRound,
    unclaimedRound,
    claimWinnings,
    isClaiming,
    lastWinner,
    isLoading: isBaseFlipLoading,
    error: baseFlipError
  } = useBaseFlip();

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleStake = async (group: 1 | 2, amount: string) => {
    try {
      await stake(group, amount);
      setTimeout(() => {
        refetchRound();
      }, 2000);
    } catch (error) {
      console.error('Stake failed:', error);
    }
  };

  // Get min/max stakes for current level
  const getLevelLimits = (levelId: number) => {
    switch (levelId) {
      case 1:
        return { min: 0.001, max: 0.05 };
      case 2:
        return { min: 0.005, max: 0.25 };
      case 3:
        return { min: 0.01, max: 0.5 };
      default:
        return { min: 0.001, max: 0.05 };
    }
  };

  const limits = getLevelLimits(selectedLevel);
  const userGroup = userStake?.amount && userStake.amount > 0n ? userStake.group : null;
  const hasStaked = userStake?.amount ? userStake.amount > 0n : false;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <img src="/logo.png" alt="BaseFlip" className={styles.logo} />
          <h1 className={styles.title}>BaseFlip</h1>
          <button onClick={() => window.location.href = '/leaderboard'} className={styles.leaderboardLink}>
            👑 Leaderboard
          </button>
        </div>
        <p className={styles.subtitle}>The Ultimate Onchain Prediction Game • Stake. Predict. Win.</p>
        <div className={styles.walletButton}>
          <Wallet>
            <ConnectWallet className={styles.connectButton}>
              <Avatar className="h-6 w-6" />
              <Name />
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
              </Identity>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </div>
      </div>

      {!mounted ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Shuffling the deck...</p>
        </div>
      ) : !isConnected ? (
        <div className={styles.connectPrompt}>
          <p>🎰 Welcome to the tables. Connect your wallet to play.</p>
        </div>
      ) : (
        <div className={styles.gameContent}>
          <LevelSelector
            selectedLevel={selectedLevel}
            onSelectLevel={setSelectedLevel}
          />

          {unclaimedRound && (
            <div className={styles.claimBanner}>
              <div className={styles.claimContent}>
                <h3>🎉 You Won Round #{unclaimedRound.toString()}!</h3>
                <button
                  className={styles.claimButton}
                  onClick={() => claimWinnings(unclaimedRound)}
                  disabled={isClaiming}
                >
                  {isClaiming ? 'Claiming...' : 'Claim Winnings'}
                </button>
              </div>
            </div>
          )}

          {roundData && (
            <>
              {roundData.isStarted && !roundData.isCompleted && (
                <div className={styles.roundStatus}>
                  <div className={styles.statusBadge}>
                    🎲 Round #{roundData.roundId.toString()} • Bets Are In!
                  </div>
                  {lastWinner && (
                    <div className={styles.lastWinner}>
                      Previous Round #{lastWinner.id.toString()} Winner:
                      <span className={lastWinner.group === 1 ? styles.groupA : styles.groupB}>
                        {lastWinner.group === 1 ? ' Pool A' : ' Pool B'}
                      </span>
                    </div>
                  )}
                  <p>Bot is flipping the coin... (Auto-resolves within 15s)</p>
                  <button
                    onClick={() => refetchRound()}
                    style={{ fontSize: '0.7rem', padding: '5px 10px', marginTop: '10px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                  >
                    Refresh Status
                  </button>
                </div>
              )}

              {roundData.isCompleted && (
                <div className={styles.roundStatus}>
                  <div className={styles.statusBadge}>
                    💎 Round Complete
                  </div>
                  <p>The cards have been dealt. Check back for the next round!</p>
                </div>
              )}

              <PoolDisplay
                poolA={roundData.poolA}
                poolB={roundData.poolB}
                targetSize={roundData.targetSize}
                userGroup={userGroup}
              />

              {!roundData.isStarted && !roundData.isCompleted && (
                <StakeInput
                  poolA={roundData.poolA}
                  poolB={roundData.poolB}
                  minStake={limits.min}
                  maxStake={limits.max}
                  onStake={handleStake}
                  isStaking={isStaking}
                  hasStaked={hasStaked}
                />
              )}
            </>
          )}


          {/* Loading States */}
          {!roundData && isBaseFlipLoading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p>Loading game data from Base...</p>
            </div>
          )}

          {!roundData && !isBaseFlipLoading && !baseFlipError && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p>Preparing the table...</p>
              {/* Fallback button in case it gets stuck here */}
              <button
                onClick={() => refetchRound()}
                className={styles.leaderboardLink}
                style={{ marginTop: '20px', fontSize: '0.8rem' }}
              >
                Force Reload
              </button>
            </div>
          )}

          {baseFlipError && (
            <div className={styles.loading}>
              <p>❌ Error loading game data</p>
              <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>{(baseFlipError as any).message || 'Contract connection failed'}</p>
              <button
                onClick={() => refetchRound()}
                className={styles.leaderboardLink}
                style={{ marginTop: '20px' }}
              >
                🔄 Try Again
              </button>
            </div>
          )}
        </div>
      )}

      <footer className={styles.footer}>
        <p>Built on Base • Play responsibly</p>
      </footer>

      <WinnersFeed />
      <AdminPanel />
      <WelcomeModal address={address} />
    </div>
  );
}
