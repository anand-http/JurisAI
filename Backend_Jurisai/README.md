# JurisAI backend

AI-assisted drafting API for Indian litigation documents. Every citation in a generated
draft is checked server-side against a lookup table of ingested statutes and judgments.
The model's own claims are never trusted.

Express 5 + TypeScript · MongoDB (users, drafts, billing) · Postgres/pgvector (legal corpus) ·
Claude Sonnet 5 for drafting, Haiku 4.5 for citation extraction · Voyage `voyage-law-2` embeddings ·
S3 for exports · Razorpay subscriptions.

## Run it locally

```bash
cp .env.example .env        # MongoDB URI + JWT secret are enough to start
npm install
npm run dev                 # port 4000
npm test                    # 138 tests; LLM, S3 and Razorpay are faked, no API spend
```

Development conveniences (all refused when `NODE_ENV=production`):
- `LEGAL_STORE=memory` + `EMBEDDING_PROVIDER=hash`: the API seeds the dev dataset at boot. No Postgres or Voyage key needed.
- `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`: drafts with Google Gemini (`gemini-3.8-flash`, checks on `gemini-3.5-flash-lite`). Same prompts, schemas and checks as Claude. **Free tier: Google may use prompts to improve its products, so use dummy case data only**; the paid tier does not.
- `LLM_PROVIDER=offline`: drafts are clearly labelled templates built from the form fields and the retrieved law, with **no AI calls**. Retrieval, citation verification, the fact check, review issues, editing and export all run for real on them.
- No `S3_BUCKET`: exports are saved under `.dev-exports/` and downloaded from the API by their owner.
- `EMAIL_PROVIDER=console`: sign-in codes are printed to the server log (masked email).

## The legal library

| Command | Loads | Source |
|---|---|---|
| `npm run ingest` | 25-source dev seed (IPC/CrPC/Evidence Act sections and case summaries not yet available elsewhere) | `data/seed/` |
| `npm run ingest:statutes` | Complete official text of BNS, BNSS, BSA, NI Act, Contract Act, TP Act and CPC: 1,801 sections | India Code API (indiacode.gov.in) |
| `npm run ingest:sc` | Supreme Court judgments by topic (bail, quashing, fir, cheque, contract, tenancy, affidavit) | Indian Supreme Court Judgments dataset (Dattam Labs) |

- Useful flags: `--dry-run` (counts only), `--acts nia,ica`, `--topics cheque,bail`, `--from/--to` years, `--limit`, and `--scan-pdfs` (judgments before mid-2023 have no official summary, so they are screened by their headnotes).
- **Safe to re-run:** unchanged sources are skipped; already-downloaded judgments are never fetched twice.
- **Changing the embedding model re-embeds everything automatically.** After switching to Voyage, run all three commands once.
- Official India Code text replaces the seed's copy of the same section, and `npm run ingest` never overwrites it.
- **Attribution required:** the judgments dataset is CC-BY-4.0, so credit "Indian Supreme Court Judgments dataset by Dattam Labs" in the app (e.g. an About/Sources screen). Have a lawyer confirm use of the headnotes and the statute text.
- The repealed IPC, CrPC and Evidence Act are not available section-by-section on the new India Code, so only the verified seed sections exist for them. The full texts are available from the Legislative Department (legislative.gov.in) as PDFs; an importer for those is the next step.

Deploying to EC2: see [deploy/README.md](deploy/README.md).

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/otp` | `{ email }` → `{ success }`. Emails a 6-digit sign-in code; new emails get an account on verify |
| POST | `/auth/verify` | `{ email, otp }` → `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }`. `401 invalid_credentials` for a wrong password, an unknown email, or an account with no password (same answer for all three) |
| PUT | `/auth/password` | Signed in: `{ newPassword, currentPassword? }` → `{ user }`. The current password is needed to change an existing one, except within 15 minutes of an email-code sign-in (that is how "forgot password" works) |
| POST | `/drafts/generate` | `{ documentType, formFields }` → `{ draftId, draftText, citations[{source_id,text,verified}], unlinkedMentions, reviewIssues }` |
| GET | `/drafts?page&limit` | `{ items, page, limit, total, totalPages }` |
| GET / PUT | `/drafts/:id` | PUT `{ draftText }` saves the lawyer's edits (original model output is kept). Both return `reviewIssues` re-evaluated on the current text |
| GET | `/drafts/:id/citation/:source_id` | Full source text + metadata for "tap to verify" |
| POST | `/drafts/:id/export` | `{ acknowledgeIssues? }` → `{ fileUrl }` (presigned S3 URL to a court-format DOCX). `409 review_required` with the open issues unless acknowledged |
| POST | `/subscriptions` | Creates a Razorpay subscription → `{ subscriptionId, keyId }` for Checkout |
| GET | `/subscriptions/me` | Plan, subscription status, this month's usage |
| POST | `/webhooks/razorpay` | Signed webhook; the only thing that changes a user's plan |

All `/drafts` and `/subscriptions` routes need `Authorization: Bearer <token>`. Errors are
`{ error: { code, message, ... } }`. Quota exhaustion is `402 quota_exceeded`.

## The generate pipeline

`src/modules/drafts/pipeline/` holds one file per step, each independently testable. `generateDraft.ts` wires them together:

1. **`1-buildRetrievalQuery`**: document-type hints + substantive form fields. Identity fields (names, addresses, Aadhaar…) are excluded so they aren't sent to the embedding provider.
2. **`2-retrieveContext`**: embeds the query, pulls top chunks from pgvector, groups them into the top-k sources (`RETRIEVAL_TOP_K`, default 6).
3. **`3-buildPrompt`**: stable, prompt-cached system prompt containing the verbatim rule *"Only cite sections/cases provided in context below…"*; retrieved sources are injected as `<source id="…">` blocks; form fields are XML-escaped so they can't break out of the data block.
4. **`4-llmGateway`**: Claude call with structured output `{ draftText, citations[{text, source_id, claimed_section}] }`. Refusals and truncation are detected from `stop_reason` before parsing.
5. **`5-verifyCitations`**: a citation is `verified: true` only if its `source_id` is in the lookup table, **and** it was in this draft's retrieved context, **and** `claimed_section` matches the stored act + section (or case name + citation). The failure reason is stored per citation. A Haiku pass then lists every authority named in the draft body; any that no citation backs are returned as `unlinkedMentions` (as the verbatim text, so clients can highlight it).
5b. **`5b-checkSupport`**: an independent Haiku pass (`SUPPORT_CHECK_MODEL`) is given each verified citation's paragraph and the exact source text the drafting model saw, and asks whether the source actually says that. `unsupported` or `partially_supported` downgrades the citation to `verified: false` (reason `unsupported_by_source`, explanation shown in tap-to-verify). It can only downgrade, never upgrade. Runs in parallel with the mention scan, costs under ₹1 per draft, and a failure never loses the draft.
6. **`6-saveDraft`**: persists draft, verification results, retrieval ids and token usage.

### Review issues and the export gate

`src/modules/drafts/review/` computes everything still open before filing, **against the current text** (so anything the lawyer has edited out stops counting):

- `unverified_citation`: an unverified citation that is still in the text
- `unlinked_authority`: an authority named with no citation behind it
- `unsupported_fact`: a date, amount, number or honorific-prefixed name that is in neither the form inputs nor the retrieved law (`factCheck.ts`, deterministic, no AI). `2026-03-01` from the app matches "1st March, 2026"; `450000` matches "Rs. 4,50,000/-" and "4.5 lakh".
- `placeholder`: an unfilled `[____]` / `[AUTHORITY REQUIRED: …]` blank

Export returns `409 review_required` (listing the issues) unless the request sends `acknowledgeIssues: true`. Each export records how many issues were acknowledged and their types, as an audit trail.

Matching is deliberately strict (`src/modules/legal/claimMatching.ts`): `Section 482 CrPC` ≠ `Section 482 BNSS`; `Section 318(2)` ≠ stored `318(4)`; a correct case name with a wrong reporter citation fails.

## Decisions you should know about

- **Temperature 0.2 is not sent to `claude-sonnet-5`.** That model rejects sampling parameters with a 400. Temperature is applied automatically only to models that accept it (e.g. set `GENERATION_MODEL=claude-sonnet-4-6`). Hallucination is controlled by the retrieval constraint and server-side verification, not sampling.
- **`unlinkedMentions` and `reviewIssues`** are extra fields on the draft responses (additive changes to the agreed contract). It catches authorities the model wrote into the body without listing them as citations. Drop it from `serializers.ts` if the client can't tolerate extra keys.
- **Unknown `documentType` values** are drafted generically rather than rejected, so the client's existing types work. Transactional types (agreements, deeds, leases…) return `400 unsupported_document_type`. Tuned profiles in `documentTypes.ts` cover the mobile app's types: `anticipatory_bail`, `regular_bail`, `legal_notice` (retrieval tuned per `noticeType`), `affidavit` (per `affidavitType`), plus `quashing_petition` and `police_complaint`.
- **Quota** is reserved atomically before generation and refunded if generation fails; months are IST calendar months. Pro gets `PRO_DRAFTS_PER_MONTH` (default 200) as a fair-use cap.
- **Exports are private**: S3 objects are SSE-encrypted and only reachable via short-lived presigned URLs.
- **Rate limits use in-memory stores**: use a shared store (e.g. Redis) when running more than one instance.

## Not done yet

- **Dev seed only**: 18 statute provisions + 7 Supreme Court cases (`data/seed/legal-sources.dev.json`), with Indian Kanoon source URLs. It covers IPC/BNS, CrPC/BNSS, the Evidence Act, the NI Act (ss.138, 139, 142), the Contract Act (ss.73, 74), the TP Act (s.106) and the CPC (s.139, O.XIX R.3, O.XVIII R.4). Case texts are *summaries of holdings, not verbatim judgment text*, and some statute sub-sections are omitted. Re-ingest real texts before production.
- **Scrapers** for India Code / Indian Kanoon are stubs (`src/ingestion/providers.ts`).
- **Email in production**: set `EMAIL_PROVIDER=ses` and `EMAIL_FROM`, verify the sending domain in Amazon SES (Mumbai), and request SES production access (new SES accounts can only email verified addresses). The console provider is refused when `NODE_ENV=production`.
- **Session revocation**: tokens are stateless JWTs (30 days). Changing a password does not sign out other devices yet.
- Subscription cancellation endpoint and email OTP are not implemented.
