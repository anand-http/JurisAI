# JurisAI — mobile app

AI-assisted litigation drafting for solo advocates in India: legal notices, bail
applications and affidavits, with every citation linked to its source text.

React Native 0.87 (bare, New Architecture) · TypeScript · React Navigation 7 ·
Zustand · Axios · Razorpay.

## Run it

```bash
npm install
cd ios && pod install && cd ..
npm start                 # Metro
npm run ios               # or: npm run android
```

By default, dev builds use the **in-app mock backend** (`env.useMockApi` in
`src/config/env.ts`). Sign in with any email and the code **123456**, or set a
password under Account and sign in with that (mock passwords last until the app restarts). Two
sample drafts are seeded, and the free plan allows 3 drafts a month.

To use the real backend, start `Backend_Jurisai` (`npm run dev`, port 4000) and set
`USE_MOCK_API = false` in `src/config/env.ts`. The contract and the backend's
remaining gaps are listed in [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

```bash
npm test                  # jest: citations, registry, encryption, API flow, export files
npx tsc --noEmit
npm run lint
```

## Structure

```
src/
  api/          axios client, endpoints + wire mappers, errors, mock backend
  components/   ui/ (buttons, fields, banners) and draft/ (document, citation chips)
  config/       env + feature flags
  documents/    document-type registry: the wizard is generated from these
  hooks/        useIsOnline
  lib/          citation segmentation, formatting, validation, base64
  navigation/   auth-gated root stack + tabs
  screens/      auth → draft (wizard, generating, review, citation, export) → history, account
  services/     export files (download/share/save/open) and Razorpay
  storage/      Keychain secrets, AES-GCM encrypted cache, session, review state
  store/        zustand stores: auth, drafts, intake, subscription
```

## Adding a document type

Create a definition next to `src/documents/bailApplication.ts`, then add it to
`DOCUMENT_TYPES` in `src/documents/registry.ts`. A definition has steps, fields,
conditional `visibleIf`, profile pre-fill and the title shown in history. The wizard,
review summary and history labels all read from the registry. To use a tuned
backend profile, set `backendType`.

## How citations are shown

`src/lib/citations.ts` splits the draft text into segments:

- **Blue ✓:** a backend citation with `verified: true`.
- **Amber ⚠:** a backend citation that could not be verified.
- **Red ?:** an authority named in the text with no citation behind it. It comes from the
  backend's `unlinkedMentions`, plus a client-side pattern check (Sections, Articles,
  Orders/Rules, SCC/AIR/INSC citations) as a safety net.

Tapping a chip opens the source text from `GET /drafts/:id/citation/:source_id`.
The lawyer can mark each reference as checked, and the export screen shows that
progress before the "I have reviewed" confirmation.

## Data on the device

- **Session token and data-encryption key:** iOS Keychain / Android Keystore
  (`react-native-keychain`). Keychain items are cleared on the first launch after a
  reinstall.
- **Case data kept for offline use** (drafts, titles, the export index, cached
  sources): AES-256-GCM before it reaches AsyncStorage, bound to its storage key
  (`src/storage/encryptedStore.ts`).
- **Plain AsyncStorage:** the lawyer's own profile, plus per-draft review flags,
  which hold only citation keys.
- **Exported DOCX/PDF files:** stored in the app's private documents folder so they
  open offline. They rely on OS file encryption, not app-level encryption.
- **Signing out** wipes the encrypted cache, the keys, the session and exported files.
- **Wizard answers** stay in memory only, and are cleared once the draft is generated.

## Known limitations

- The generation progress stages are timed, because `POST /drafts/generate` returns once.
  The last stage only completes when the server responds. Streaming or job-status
  events from the backend could drive the stages directly.
- Razorpay's "cancelled" error codes (0 on Android, 2 on iOS) are handled as a silent
  cancel. Re-check them when upgrading the SDK.
- Only a light theme is designed.
