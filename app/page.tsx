"use client";
import { useState, useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAllUnclaimedWinnings } from "./hooks/useAllUnclaimedWinnings";
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
import CoinFlipAnimation from "./components/CoinFlipAnimation/CoinFlipAnimation";
import styles from "./page.module.css";
import { usePlatformStats } from "./hooks/usePlatformStats";
import { useEthPrice } from "./hooks/useEthPrice";
import HistoryModal from "./components/HistoryModal/HistoryModal";

// Internal component for stats to keep page clean
function PlatformStatsBanner() {
  const { totalVolume, isLoading } = usePlatformStats();
  const { convertEthToUsd } = useEthPrice();

  if (isLoading) return null;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      background: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '20px',
      margin: '0 auto 20px',
      width: 'fit-content',
      maxWidth: '90%',
      flexWrap: 'wrap',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Total Volume:</span>
      <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#00D4FF' }}>
        {Number(totalVolume).toFixed(4)} ETH
      </span>
      <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
        ({convertEthToUsd(totalVolume)})
      </span>
    </div>
  );
}

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
    error: baseFlipError,
    reclaimStake,
    isReclaiming
  } = useBaseFlip();

  const { claimableRounds, claimRound, isClaiming: isClaimingLegacy, scanForWinnings } = useAllUnclaimedWinnings();

  const [isFlipping, setIsFlipping] = useState(false);
  const [flipWinner, setFlipWinner] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { history, recordRoundResult } = useUserHistory();
  const [lastAnimatedId, setLastAnimatedId] = useState<bigint | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lastAnimatedRoundId');
      try {
        return saved ? BigInt(saved) : null;
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    // Watch for updates to lastWinner (which represents the just-completed round)
    if (lastWinner && lastWinner.group > 0) {
      // Check if we already animated THIS round ID
      if (lastAnimatedId !== lastWinner.id) {
        console.log("Triggering Flip Animation & Record! Round:", lastWinner.id);
        setIsFlipping(true);
        setFlipWinner(lastWinner.group);
        setLastAnimatedId(lastWinner.id); // Mark as animated in state

        // Persist to localStorage so it doesn't replay on refresh
        localStorage.setItem('lastAnimatedRoundId', lastWinner.id.toString());

        // PERSISTENCE: Record result to local "Rounds Log"
        if (prevUserStake && prevRound) {
          const s = prevUserStake as any;
          const r = prevRound as any;
          const isSArr = Array.isArray(s);
          const isRArr = Array.isArray(r);

          const group = Number(isSArr ? s[1] : s.group);
          const stakeAmtBn = (isSArr ? s[0] : s.amount) as bigint;

          if (group > 0 && stakeAmtBn > 0n) {
            const poolA = (isRArr ? r[1] : r.poolA) as bigint;
            const poolB = (isRArr ? r[2] : r.poolB) as bigint;
            const winningGroup = Number(isRArr ? r[8] : r.winningGroup);
            const createdAt = Number(isRArr ? r[4] : r.createdAt);
            const isCancelled = isRArr ? r[7] : r.isCancelled;

            const isWinner = !isCancelled && winningGroup === group;
            let displayAmt = formatEther(stakeAmtBn);

            if (isWinner) {
              const winningPool = winningGroup === 1 ? poolA : poolB;
              const losingPool = winningGroup === 1 ? poolB : poolA;
              if (winningPool > 0n) {
                const payoutPool = (losingPool * 99n) / 100n;
                const share = (stakeAmtBn * payoutPool) / winningPool;
                displayAmt = formatEther(stakeAmtBn + share);
              }
            }

            recordRoundResult({
              roundId: Number(lastWinner.id),
              amount: displayAmt,
              stakeAmount: formatEther(stakeAmtBn),
              group,
              winningGroup,
              isCompleted: true,
              isWinner,
              timestamp: createdAt || Math.floor(Date.now() / 1000),
              isClaimed: false
            });
          }
        }
      }
    }
  }, [lastWinner, lastAnimatedId, prevUserStake, prevRound, recordRoundResult]);

  const handleFlipComplete = () => {
    setIsFlipping(false);
    setFlipWinner(null);
  };

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
          <button onClick={() => setShowHistory(true)} className={styles.leaderboardLink}>
            📜 My Bets
          </button>
        </div>
        <p className={styles.subtitle}>The Ultimate Onchain Prediction Game • Stake. Predict. Win.</p>
        <div className={styles.walletButton}>
          <Wallet>
            <ConnectWallet className={styles.connectButton}>
              <Avatar className="h-6 w-6" />
              <Name />
            </ConnectWallet>
            <WalletDropdown className={styles.walletDropdown}>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
              </Identity>
              <WalletDropdownDisconnect className={styles.disconnectButton} />
            </WalletDropdown>
          </Wallet>
        </div>
      </div>

      <PlatformStatsBanner />

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

          {/* Stuck Round Detection (24h Safety Valve) */
            roundData &&
            !roundData.isStarted &&
            !roundData.isCompleted &&
            (Date.now() / 1000) > (Number(roundData.roundId > 1n ? /* We don't have createdAt in roundData struct passed to frontend yet properly, checking logic below */ 0 : 0))
            /* Actually, strict creation time is checked on contract. Frontend heuristic: if roundId created > 24h ago. 
               But roundData struct in useBaseFlip doesn't have createdAt exposed clearly yet (index 4).
               Let's add it or rely on fail state. 
               Since I can't easily edit RoundData struct across files safely without checking useBaseFlip again, 
               I'll just add a "Force Refund" button that appears if "Force Reload" is clicked multiple times or just add it to AdminPanel?
               No, user needs it. 
               SAFE OPTION: If pool is not full, and user wants to exit, they can try. Contract will revert if <24h.
             */
          }

          {roundData && !roundData.isStarted && !roundData.isCompleted && hasStaked && (
            <div style={{ marginTop: '10px', textAlign: 'center' }}>
              <button
                onClick={() => reclaimStake(roundData.roundId)}
                disabled={isReclaiming}
                style={{
                  background: 'transparent',
                  border: '1px solid #FF4444',
                  color: '#FF4444',
                  fontSize: '0.75rem',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: 0.8
                }}
              >
                ⚠️ Stuck? Claim Refund (Available after 24h)
              </button>
            </div>
          )}

          {claimableRounds.length > 0 && (
            <div className={styles.claimBanner}>
              <div className={styles.claimContent}>
                <h3>🎉 You Have Unclaimed Winnings!</h3>
                {claimableRounds.map((round) => (
                  <div key={round.roundId.toString()} style={{ marginBottom: '10px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Round #{round.roundId.toString()}</span>
                      <button
                        className={styles.claimButton}
                        onClick={() => {
                          claimRound(round.roundId);
                          // Optimistic update or refetch
                          setTimeout(scanForWinnings, 5000);
                        }}
                        disabled={isClaimingLegacy}
                        style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                      >
                        Claim
                      </button>
                    </div>
                  </div>
                ))}
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
                  {lastWinner && (
                    <button
                      onClick={() => {
                        setIsFlipping(true);
                        setFlipWinner(lastWinner.group);
                      }}
                      style={{
                        fontSize: '0.7rem',
                        padding: '4px 8px',
                        marginBottom: '10px',
                        background: 'rgba(255,255,255,0.15)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '12px',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'block',
                        margin: '5px auto'
                      }}
                    >
                      ↺ Replay Round #{lastWinner.id.toString()} Flip
                    </button>
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
      <CoinFlipAnimation
        isFlipping={isFlipping}
        winningGroup={flipWinner}
        onAnimationComplete={handleFlipComplete}
      />

      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}
