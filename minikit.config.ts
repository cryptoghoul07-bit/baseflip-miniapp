const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://baseflip.vercel.app');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    name: "BaseFlip",
    subtitle: "Prediction Game on Base",
    description: "Stake ETH on competing groups in this prediction game. Win big with pro-rata payouts!",
    screenshotUrls: [`${ROOT_URL}/screenshot-portrait.png`],
    iconUrl: `${ROOT_URL}/blue-icon.png`,
    splashImageUrl: `${ROOT_URL}/blue-hero.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "social",
    tags: ["gaming", "prediction", "base", "crypto", "staking"],
    heroImageUrl: `${ROOT_URL}/blue-hero.png`,
    tagline: "Stake, Predict, Win on Base",
    ogTitle: "BaseFlip - Prediction Game",
    ogDescription: "Compete in prediction rounds and win ETH on Base blockchain",
    ogImageUrl: `${ROOT_URL}/blue-hero.png`,
  },
} as const;

