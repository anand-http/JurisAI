# JurisAI API contract (client view)

The app talks to **Backend_Jurisai** (Express, port 4000, routes at the root).
Wire types live in `src/api/wire.ts`; `src/api/endpoints.ts` maps them to the
app's domain model. The in-app mock (`src/api/mock/`) speaks the same format.

## Used as the backend implements them today

| Method | Path | Client use |
|---|---|---|
| POST | `/auth/otp` `{ email }` | Email a sign-in code (creates the account on first verify) |
| POST | `/auth/verify` `{ email, otp }` → `{ token, user }` | Sign in with the code; token stored in Keychain |
| POST | `/auth/login` `{ email, password }` → `{ token, user }` | Sign in with a password. `401 invalid_credentials` is shown as-is |
| PUT | `/auth/password` `{ newPassword, currentPassword? }` → `{ user }` | Account → Set/Change password. Within 15 minutes of an email-code sign-in no current password is needed; otherwise `400 current_password_required` makes the screen ask for it |
| POST | `/drafts/generate` `{ documentType, formFields }` | Generate. Bail drafts send `regular_bail` / `anticipatory_bail` (the tuned profiles); notices and affidavits send `legal_notice` / `affidavit`, also tuned profiles whose retrieval follows `noticeType` / `affidavitType` |
| GET | `/drafts?page&limit` | History list, infinite scroll |
| GET / PUT | `/drafts/:id` (`{ draftText }`) | Review / inline edit |
| GET | `/drafts/:id/citation/:source_id` | "Tap to verify" source text. `404 source_not_found` is shown as "no source exists" |
| POST | `/drafts/:id/export` `{ format, paperSize, acknowledgeIssues }` → `{ fileUrl }` | Downloads the DOCX into app storage for offline use. `acknowledgeIssues` is the "I have reviewed" checkbox; without it the backend returns `409 review_required` while issues are open |
| POST | `/subscriptions` → `{ subscriptionId, keyId }` | Opens Razorpay Checkout with `subscription_id` |
| GET | `/subscriptions/me` | Plan + usage meter; polled after checkout until the webhook activates Pro |

`unlinkedMentions` from generate/get is rendered as red "no source attached" chips
(the backend sends the verbatim text so the chip lands on the right words).
`reviewIssues` from generate/get/put lists what is still open before filing. The export
screen shows the `unsupported_fact` items (a date, amount, number or name not found in the
intake answers) and `placeholder` items (unfilled blanks). Citation issues are already
counted by the client. A citation whose source doesn't support the draft's claim arrives
as `verified: false`, with the explanation in `verification_detail` on tap-to-verify.
Errors are read from `{ error: { code, message } }`; `402` opens the paywall.

## Gaps: what the backend needs for full spec parity

The client already handles each of these, and degrades gracefully until the
backend supports them.

1. **Lawyer profile.** `GET /me` and `PUT /me/profile` with body
   `{ fullName, barRegistrationNumber, enrolmentState, practiceAreas[], primaryCourt, city }`,
   plus `profile` on the user object returned by `/auth/verify`.
   *Until then:* the profile is saved on the device only (on a 404), so it must be
   re-entered after signing out or on a new device.
2. **Draft titles in the list.** Add `title` to the summaries from `GET /drafts`
   (for example "Bail application — Ravi Kumar", built from formFields). *Until then:* titles
   come from the device's encrypted cache, falling back to the document type.
3. **Search.** Support a `q` param on `GET /drafts`. *Until then:* search runs on the
   device over loaded drafts. The client already sends `q`.
4. **PDF export and paper size.** Accept `{ format: 'pdf' | 'docx', paperSize: 'A4' | 'LEGAL' }`
   on export. *Until then:* only DOCX is offered (`env.features.pdfExport`).
5. **Pro price.** The paywall shows `env.proPlan.priceLabel` (₹499/month, a
   placeholder). Either keep it in sync with `RAZORPAY_PRO_PLAN_ID`, or expose the
   plan price from the backend.
