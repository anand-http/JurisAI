import { Platform } from 'react-native';

/**
 * App configuration. Values here are safe to ship in the bundle — never put
 * secrets (Razorpay key secret, API keys) in this file.
 */

// Android emulators reach the host machine on 10.0.2.2, iOS simulators on localhost.
const DEV_API_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

/**
 * When true, every API call is served by the in-app mock backend in
 * src/api/mock. Set to false to talk to Backend_Jurisai (npm run dev).
 */
const USE_MOCK_API = __DEV__;

export const env = {
  appName: 'JurisAI',

  /** Backend_Jurisai (Express) — routes are mounted at the root. */
  apiBaseUrl: __DEV__
    ? `http://${DEV_API_HOST}:4000`
    : 'https://api.jurisai.in',

  useMockApi: USE_MOCK_API,

  /**
   * Client features that need backend support which Backend_Jurisai does not
   * have yet (see docs/API_CONTRACT.md). The mock backend supports them.
   */
  features: {
    pdfExport: USE_MOCK_API,
  },

  /** Shown on the paywall. Must match the Razorpay plan (RAZORPAY_PRO_PLAN_ID). */
  proPlan: {
    name: 'JurisAI Pro',
    priceLabel: '₹499',
    interval: 'month',
  },

  requestTimeoutMs: 20_000,
  /** Draft generation runs retrieval + LLM drafting server-side; allow for it. */
  generateTimeoutMs: 120_000,

  /** Maximum number of full drafts kept in the encrypted offline cache. */
  offlineDraftLimit: 50,
} as const;
