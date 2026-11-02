import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import PizZip from "pizzip";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DraftModel } from "../src/models/draft.model.js";
import { LocalFileStorage } from "../src/modules/export/fileStorage.js";
import { UsageModel } from "../src/models/usage.model.js";
import { LlmError } from "../src/modules/drafts/pipeline/4-llmGateway.js";
import { promptSourceIds, startTestApp, WEBHOOK_SECRET } from "./helpers/testApp.js";

type TestApp = Awaited<ReturnType<typeof startTestApp>>;
let t: TestApp;

const FACTS = "The applicant was falsely named by his business partner Rajiv Malhotra after a dispute over Rs 42 lakh";
const FORM = {
  applicantName: "Suresh Kumar Verma",
  firDetails: "FIR 210/2026, Kothrud Police Station, Pune",
  facts: FACTS,
};

async function login(email: string): Promise<string> {
  await request(t.app).post("/auth/otp").send({ email }).expect(200, { success: true });
  const res = await request(t.app).post("/auth/verify").send({ email, otp: t.email.codes.get(email) }).expect(200);
  return res.body.token as string;
}

/** Model that cites one valid source plus three kinds of bad citation. */
function citeMixed() {
  t.llm.respond = (prompt) => {
    const retrieved = promptSourceIds(prompt);
    expect(retrieved).toContain("crpc-s438");
    const notRetrieved = ["iea-s101", "ipc-s420", "crpc-s154", "bns-s85"].find((id) => !retrieved.includes(id))!;
    return {
      draftText:
        "IN THE COURT OF THE SESSIONS JUDGE, PUNE\n\nAPPLICATION UNDER SECTION 438 OF THE CODE OF CRIMINAL PROCEDURE, 1973\n\n1. The applicant apprehends arrest. Section 41A of the Code of Criminal Procedure, 1973 also applies.",
      citations: [
        { source_id: "crpc-s438", claimed_section: "Section 438, Code of Criminal Procedure, 1973", text: "Section 438 of the Code of Criminal Procedure, 1973" },
        { source_id: "ipc-s999", claimed_section: "Section 999, Indian Penal Code, 1860", text: "Section 999 IPC" },
        { source_id: notRetrieved, claimed_section: "Section 101, Indian Evidence Act, 1872", text: "Section 101" },
        { source_id: "crpc-s438", claimed_section: "Section 437, Code of Criminal Procedure, 1973", text: "Section 437" },
      ],
    };
  };
  t.llm.mentions = [
    { kind: "statute", quote: "SECTION 438 OF THE CODE OF CRIMINAL PROCEDURE, 1973", reference: "Section 438, Code of Criminal Procedure, 1973" },
    { kind: "statute", quote: "Section 41A of the Code of Criminal Procedure, 1973", reference: "Section 41A, Code of Criminal Procedure, 1973" },
  ];
  t.llm.support = (items) => items.map((i) => ({ id: i.id, verdict: "supported", explanation: "" }));
}

const generate = (token: string, body: object = { documentType: "anticipatory_bail", formFields: FORM }) =>
  request(t.app).post("/drafts/generate").set("authorization", `Bearer ${token}`).send(body);

function signedWebhook(body: object, eventId: string) {
  const raw = JSON.stringify(body);
  return request(t.app)
    .post("/webhooks/razorpay")
    .set("content-type", "application/json")
    .set("x-razorpay-event-id", eventId)
    .set("x-razorpay-signature", createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"))
    .send(raw);
}

const subscriptionEvent = (event: string, status: string, createdAt: number, subId = "sub_test_1") => ({
  event,
  created_at: createdAt,
  payload: {
    subscription: { entity: { id: subId, status, current_start: createdAt, current_end: createdAt + 30 * 86400 } },
    payment: { entity: { id: `pay_${createdAt}` } },
  },
});

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});
beforeEach(() => citeMixed());

describe("auth: email code", () => {
  it("rejects invalid emails, and the phone flow no longer exists", async () => {
    const res = await request(t.app).post("/auth/otp").send({ email: "not-an-email" }).expect(400);
    expect(res.body.error.code).toBe("validation_error");
    const phone = await request(t.app).post("/auth/otp").send({ phone: "9876500001" }).expect(400);
    expect(phone.body.error.issues).toEqual([{ path: "email", message: "Enter a valid email address" }]);
  });

  it("issues a token for a correct code, normalises the email, and each code is single use", async () => {
    await request(t.app).post("/auth/otp").send({ email: "  Adv.One@Chambers.TEST " }).expect(200);
    const otp = t.email.codes.get("adv.one@chambers.test")!;
    await request(t.app).post("/auth/verify").send({ email: "adv.one@chambers.test", otp: otp === "000000" ? "111111" : "000000" }).expect(400);

    const res = await request(t.app).post("/auth/verify").send({ email: "ADV.ONE@chambers.test", otp }).expect(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: "adv.one@chambers.test",
      name: null,
      hasPassword: false,
      plan: "free",
      planRenewsAt: null,
      createdAt: expect.any(String),
    });

    const replay = await request(t.app).post("/auth/verify").send({ email: "adv.one@chambers.test", otp }).expect(400);
    expect(replay.body.error.code).toBe("otp_invalid");
  });

  it("locks the code after too many wrong attempts", async () => {
    await request(t.app).post("/auth/otp").send({ email: "adv.two@chambers.test" }).expect(200);
    const otp = t.email.codes.get("adv.two@chambers.test")!;
    const wrong = otp === "123456" ? "654321" : "123456";
    for (let i = 0; i < t.config.OTP_MAX_ATTEMPTS; i++) {
      await request(t.app).post("/auth/verify").send({ email: "adv.two@chambers.test", otp: wrong }).expect(400);
    }
    const res = await request(t.app).post("/auth/verify").send({ email: "adv.two@chambers.test", otp }).expect(429);
    expect(res.body.error.code).toBe("otp_attempts_exceeded");
  });

  it("still reports malformed JSON as a 400", async () => {
    const res = await request(t.app).post("/auth/otp").set("content-type", "application/json").send("{bad json").expect(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("requires a valid bearer token on drafts", async () => {
    await request(t.app).get("/drafts").expect(401);
    await request(t.app).get("/drafts").set("authorization", "Bearer not-a-jwt").expect(401);
  });
});

describe("auth: email and password", () => {
  const EMAIL = "adv.pass@chambers.test";
  const PASSWORD = "Nyaya-2026-secure";
  let otpToken: string;

  const passwordLogin = (email: string, password: string) => request(t.app).post("/auth/login").send({ email, password });
  const setPassword = (token: string, body: object) =>
    request(t.app).put("/auth/password").set("authorization", `Bearer ${token}`).send(body);

  beforeAll(async () => {
    otpToken = await login(EMAIL);
  });

  it("gives the same answer for no password, wrong password and unknown email", async () => {
    const noPassword = await passwordLogin(EMAIL, PASSWORD).expect(401);
    const unknown = await passwordLogin("nobody@chambers.test", PASSWORD).expect(401);
    expect(noPassword.body).toEqual(unknown.body);
    expect(noPassword.body.error).toEqual({ code: "invalid_credentials", message: "Incorrect email or password" });
  });

  it("rejects short passwords and the email itself", async () => {
    const short = await setPassword(otpToken, { newPassword: "short" }).expect(400);
    expect(short.body.error.issues[0].message).toBe("Password must be at least 8 characters");
    const same = await setPassword(otpToken, { newPassword: EMAIL }).expect(400);
    expect(same.body.error.code).toBe("weak_password");
  });

  it("lets a signed-in user set a password, then sign in with it", async () => {
    const res = await setPassword(otpToken, { newPassword: PASSWORD }).expect(200);
    expect(res.body.user).toMatchObject({ email: EMAIL, hasPassword: true });
    expect(JSON.stringify(res.body)).not.toContain("scrypt");

    const ok = await passwordLogin("  Adv.Pass@Chambers.test", PASSWORD).expect(200);
    expect(ok.body.user).toMatchObject({ email: EMAIL, hasPassword: true });
    expect(JSON.stringify(ok.body)).not.toContain("passwordHash");
    await request(t.app).get("/drafts").set("authorization", `Bearer ${ok.body.token}`).expect(200);

    const wrong = await passwordLogin(EMAIL, "not-the-password").expect(401);
    expect(wrong.body.error.code).toBe("invalid_credentials");
  });

  it("needs the current password to change it from a password session", async () => {
    const { body } = await passwordLogin(EMAIL, PASSWORD).expect(200);
    const missing = await setPassword(body.token, { newPassword: "Another-pass-1" }).expect(400);
    expect(missing.body.error.code).toBe("current_password_required");
    const incorrect = await setPassword(body.token, { newPassword: "Another-pass-1", currentPassword: "guess" }).expect(400);
    expect(incorrect.body.error.code).toBe("current_password_incorrect");

    await setPassword(body.token, { newPassword: "Another-pass-1", currentPassword: PASSWORD }).expect(200);
    await passwordLogin(EMAIL, PASSWORD).expect(401);
    await passwordLogin(EMAIL, "Another-pass-1").expect(200);
  });

  it("forgot password: a fresh email-code session can set a new one without the old", async () => {
    const fresh = await login(EMAIL);
    await setPassword(fresh, { newPassword: PASSWORD }).expect(200);
    await passwordLogin(EMAIL, PASSWORD).expect(200);
  });

  it("an email-code session older than 15 minutes must give the current password", async () => {
    const { body } = await passwordLogin(EMAIL, PASSWORD).expect(200);
    const userId = (jwt.decode(body.token) as { sub: string }).sub;
    const stale = jwt.sign({ amr: "otp", iat: Math.floor(Date.now() / 1000) - 20 * 60 }, t.config.JWT_SECRET, {
      subject: userId,
      expiresIn: 3600,
      algorithm: "HS256",
    });
    const res = await setPassword(stale, { newPassword: "Third-pass-123" }).expect(400);
    expect(res.body.error.code).toBe("current_password_required");
  });

  it("never logs emails, passwords or codes", () => {
    const logs = t.logLines.join("\n");
    expect(logs).toContain("/auth/login");
    expect(logs).not.toContain(EMAIL);
    expect(logs).not.toContain(PASSWORD);
    expect(logs).not.toContain("Another-pass-1");
  });
});

describe("POST /drafts/generate", () => {
  let token: string;
  let draftId: string;
  let body: Record<string, unknown>;

  beforeAll(async () => {
    token = await login("adv.11111@chambers.test");
    citeMixed();
    const res = await generate(token).expect(201);
    body = res.body;
    draftId = res.body.draftId;
  });

  it("returns the contract shape", () => {
    expect(Object.keys(body).sort()).toEqual(["citations", "draftId", "draftText", "reviewIssues", "unlinkedMentions"]);
    for (const c of body.citations as object[]) expect(Object.keys(c).sort()).toEqual(["source_id", "text", "verified"]);
  });

  it("verifies citations server-side against the lookup table", () => {
    expect((body.citations as { source_id: string; verified: boolean }[]).map((c) => c.verified)).toEqual([true, false, false, false]);
  });

  it("stores why each citation failed", async () => {
    const draft = await DraftModel.findById(draftId).lean();
    expect(draft!.citations.map((c) => c.reason)).toEqual([
      "verified",
      "unknown_source_id",
      "not_in_retrieved_context",
      "claim_mismatch",
    ]);
    expect(draft!.retrieval.sourceIds).toContain("crpc-s438");
    expect(draft!.generatedText).toBe(draft!.draftText);
  });

  it("flags authorities in the body that no verified citation backs, as the verbatim text", () => {
    expect(body.unlinkedMentions).toEqual([{ mention: "Section 41A of the Code of Criminal Procedure, 1973", kind: "statute" }]);
  });

  it("support-checks each verified citation against the source text the model saw", () => {
    const items = t.llm.supportItems.at(-1)!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ citedAs: "Section 438, Code of Criminal Procedure, 1973" });
    expect(items[0]!.sourceText).toContain("reason to believe that he may be arrested");
  });

  it("puts the form fields but not identity fields into retrieval, and the citation rule into the prompt", () => {
    const prompt = t.llm.prompts.at(-1)!;
    expect(prompt.system).toContain("Only cite sections/cases provided in context below.");
    expect(prompt.user).toContain(FACTS); // the model needs the facts
  });

  it("never writes case facts, draft text or email addresses to logs", () => {
    const logs = t.logLines.join("\n");
    expect(logs).toContain("draft generated");
    expect(logs).not.toContain("Rajiv Malhotra");
    expect(logs).not.toContain("Suresh Kumar Verma");
    expect(logs).not.toContain("SESSIONS JUDGE");
    expect(logs).not.toContain("adv.11111@chambers.test");
  });

  it("rejects transactional documents and malformed bodies without spending quota", async () => {
    const token2 = await login("adv.22222@chambers.test");
    const res = await generate(token2, { documentType: "lease_agreement", formFields: {} }).expect(400);
    expect(res.body.error.code).toBe("unsupported_document_type");
    await generate(token2, { documentType: "anticipatory_bail" }).expect(400);
    const usage = await UsageModel.findOne({}).sort({ _id: -1 }).lean();
    expect(usage?.draftsGenerated ?? 0).toBe(0);
  });

  describe("GET /drafts/:id/citation/:source_id", () => {
    it("returns the full source text and metadata for tap-to-verify", async () => {
      const res = await request(t.app).get(`/drafts/${draftId}/citation/crpc-s438`).set("authorization", `Bearer ${token}`).expect(200);
      expect(res.body).toMatchObject({
        source_id: "crpc-s438",
        verified: true,
        source_type: "statute",
        source_url: "https://indiankanoon.org/doc/1783708/",
        metadata: { act_name: "Code of Criminal Procedure, 1973", section_number: "438" },
      });
      expect(res.body.text).toContain("reason to believe that he may be arrested");
    });

    it("404s a fabricated source_id with verified: false", async () => {
      const res = await request(t.app).get(`/drafts/${draftId}/citation/ipc-s999`).set("authorization", `Bearer ${token}`).expect(404);
      expect(res.body.error).toMatchObject({ code: "source_not_found", verified: false });
    });

    it("does not expose sources unrelated to the draft", async () => {
      const draft = await DraftModel.findById(draftId).lean();
      const related = new Set([...draft!.retrieval.sourceIds, ...draft!.citations.map((c) => c.sourceId)]);
      const unrelated = ["case-sc-1990-bhajan-lal", "case-sc-2013-lalita-kumari", "crpc-s154", "iea-s101"].find((id) => !related.has(id));
      expect(unrelated).toBeDefined();
      await request(t.app).get(`/drafts/${draftId}/citation/${unrelated}`).set("authorization", `Bearer ${token}`).expect(404);
    });
  });

  describe("review issues and export gate", () => {
    it("lists what is still open, evaluated against the current text", async () => {
      const res = await request(t.app).get(`/drafts/${draftId}`).set("authorization", `Bearer ${token}`).expect(200);
      // The three bad citations aren't in the text, so only the uncited Section 41A is open.
      expect(res.body.reviewIssues).toEqual([
        { type: "unlinked_authority", text: "Section 41A of the Code of Criminal Procedure, 1973" },
      ]);
    });

    it("refuses to export with open issues unless the lawyer acknowledges them", async () => {
      const res = await request(t.app).post(`/drafts/${draftId}/export`).set("authorization", `Bearer ${token}`).send({}).expect(409);
      expect(res.body.error).toMatchObject({ code: "review_required", issues: [{ type: "unlinked_authority" }] });
      expect(t.storage.files.size).toBe(0);
    });

    it("exports after acknowledgement and records it for audit", async () => {
      await request(t.app)
        .post(`/drafts/${draftId}/export`)
        .set("authorization", `Bearer ${token}`)
        .send({ format: "docx", paperSize: "A4", acknowledgeIssues: true })
        .expect(200);
      const draft = await DraftModel.findById(draftId).lean();
      expect(draft!.exports.at(-1)).toMatchObject({ acknowledgedIssues: 1, issueTypes: ["unlinked_authority"] });
    });
  });

  describe("CRUD", () => {
    it("lists drafts with pagination", async () => {
      const res = await request(t.app).get("/drafts?page=1&limit=10").set("authorization", `Bearer ${token}`).expect(200);
      expect(res.body).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
      expect(res.body.items[0]).toMatchObject({ draftId, citationCount: 4, verifiedCitationCount: 1 });
    });

    it("saves the lawyer's edits and keeps the generated text for audit", async () => {
      const res = await request(t.app)
        .put(`/drafts/${draftId}`)
        .set("authorization", `Bearer ${token}`)
        .send({ draftText: "EDITED BY COUNSEL\n\n1. Revised paragraph." })
        .expect(200);
      expect(res.body).toMatchObject({ draftId, draftText: "EDITED BY COUNSEL\n\n1. Revised paragraph.", status: "edited" });
      const draft = await DraftModel.findById(draftId).lean();
      expect(draft!.generatedText).toContain("SESSIONS JUDGE");
    });

    it("hides other users' drafts", async () => {
      const other = await login("adv.33333@chambers.test");
      await request(t.app).get(`/drafts/${draftId}`).set("authorization", `Bearer ${other}`).expect(404);
      await request(t.app).put(`/drafts/${draftId}`).set("authorization", `Bearer ${other}`).send({ draftText: "x" }).expect(404);
      await request(t.app).get("/drafts/not-an-id").set("authorization", `Bearer ${other}`).expect(404);
    });
  });

  describe("POST /drafts/:id/export", () => {
    it("renders the edited text to DOCX, stores it privately and returns a signed URL", async () => {
      const res = await request(t.app).post(`/drafts/${draftId}/export`).set("authorization", `Bearer ${token}`).expect(200);
      expect(res.body.fileUrl).toMatch(/^https:\/\/files\.test\/exports\/.+\.docx\?signature=/);

      const [key, buf] = [...t.storage.files.entries()].at(-1)!;
      expect(key).toContain(draftId);
      const xml = new PizZip(buf).file("word/document.xml")!.asText();
      expect(xml).toContain("EDITED BY COUNSEL");
      expect(xml).not.toContain("SESSIONS JUDGE");

      // The edit removed every open issue, so no acknowledgement was needed.
      const draft = await DraftModel.findById(draftId).lean();
      expect(draft!.exports.at(-1)).toMatchObject({ acknowledgedIssues: 0, issueTypes: [] });
    });
  });
});

describe("local export storage (development, no S3)", () => {
  it("serves exported files only to their owner, on the host the client used", async () => {
    // Dot-prefixed like the real default (.dev-exports), which Express hides unless allowed.
    const dir = await mkdtemp(join(tmpdir(), ".jurisai-exports-"));
    const app = createApp({ ...t.deps, storage: new LocalFileStorage(dir) });
    const owner = await login("adv.local1@chambers.test");
    const other = await login("adv.local2@chambers.test");

    citeMixed();
    const draft = await request(app).post("/drafts/generate").set("authorization", `Bearer ${owner}`).send({ documentType: "anticipatory_bail", formFields: FORM }).expect(201);
    const exp = await request(app)
      .post(`/drafts/${draft.body.draftId}/export`)
      .set("authorization", `Bearer ${owner}`)
      .set("host", "10.0.2.2:4000")
      .send({ acknowledgeIssues: true })
      .expect(200);
    expect(exp.body.fileUrl).toMatch(/^http:\/\/10\.0\.2\.2:4000\/dev-files\/exports\/[a-f0-9]{24}\/[a-f0-9]{24}\/\d+\.docx$/);

    const path = new URL(exp.body.fileUrl).pathname;
    const file = await request(app).get(path).set("authorization", `Bearer ${owner}`).responseType("blob").expect(200);
    expect(file.headers["content-disposition"]).toContain("attachment");
    expect(new PizZip(file.body).file("word/document.xml")).toBeTruthy();

    await request(app).get(path).set("authorization", `Bearer ${other}`).expect(404);
    await request(app).get(path).expect(401);
    await request(app).get("/dev-files/exports/../../etc/passwd").set("authorization", `Bearer ${owner}`).expect(404);
  });
});

describe("second-pass checks", () => {
  let token: string;
  const OVERSTATED = "5. Under Section 438 of the Code of Criminal Procedure, 1973 the Court must decide within 24 hours.";

  beforeAll(async () => {
    token = await login("adv.66666@chambers.test");
  });

  function respondWithFactsAndSupportIssues() {
    t.llm.respond = () => ({
      draftText: [
        "IN THE COURT OF THE SESSIONS JUDGE, [CITY]",
        "1. The applicant was named in FIR 210/2026 registered on 15.08.2026 at Kothrud Police Station, Pune.",
        "2. The complainant alleges a loss of Rs. 5,00,000/- caused by Shri Vikram Singh.",
        OVERSTATED,
      ].join("\n\n"),
      citations: [
        { source_id: "crpc-s438", claimed_section: "Section 438, Code of Criminal Procedure, 1973", text: "Section 438 of the Code of Criminal Procedure, 1973" },
      ],
    });
    t.llm.mentions = [];
    t.llm.support = (items) =>
      items.map((i) =>
        i.passage.includes("24 hours")
          ? { id: i.id, verdict: "unsupported", explanation: "Section 438 sets no time limit for deciding the application." }
          : { id: i.id, verdict: "supported", explanation: "" },
      );
  }

  it("downgrades a real citation that the source does not support", async () => {
    respondWithFactsAndSupportIssues();
    const res = await generate(token).expect(201);
    expect(res.body.citations).toEqual([
      { source_id: "crpc-s438", text: "Section 438 of the Code of Criminal Procedure, 1973", verified: false },
    ]);

    const source = await request(t.app)
      .get(`/drafts/${res.body.draftId}/citation/crpc-s438`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    expect(source.body).toMatchObject({ verified: false, source_type: "statute" });
    expect(source.body.verification_detail).toBe(
      "The source does not support this: Section 438 sets no time limit for deciding the application.",
    );
  });

  it("flags invented facts, unsupported citations and blanks, and re-checks after the lawyer edits", async () => {
    respondWithFactsAndSupportIssues();
    const res = await generate(token).expect(201);
    const byType = (issues: Array<{ type: string; text: string; kind?: string }>) =>
      issues.map((i) => `${i.type}${i.kind ? `:${i.kind}` : ""} ${i.text}`);

    expect(byType(res.body.reviewIssues)).toEqual([
      "unverified_citation Section 438 of the Code of Criminal Procedure, 1973",
      "unsupported_fact:date 15.08.2026",
      "unsupported_fact:amount Rs. 5,00,000/-",
      "unsupported_fact:name Vikram Singh",
      "unsupported_fact:number 24", // the invented "24 hours": caught here as well as by the support check
      "placeholder [CITY]",
    ]);

    // The lawyer fixes the facts and the court name, and deletes the overstated paragraph.
    const fixed = await request(t.app)
      .put(`/drafts/${res.body.draftId}`)
      .set("authorization", `Bearer ${token}`)
      .send({
        draftText: [
          "IN THE COURT OF THE SESSIONS JUDGE, PUNE",
          "1. The applicant was named in FIR 210/2026 registered at Kothrud Police Station, Pune.",
        ].join("\n\n"),
      })
      .expect(200);
    expect(fixed.body.reviewIssues).toEqual([]);
    await request(t.app).post(`/drafts/${res.body.draftId}/export`).set("authorization", `Bearer ${token}`).send({}).expect(200);
  });

  it("keeps the draft when the support check itself fails", async () => {
    citeMixed();
    t.llm.support = () => {
      throw new Error("support model unavailable");
    };
    const res = await generate(token).expect(201);
    expect(res.body.citations[0]).toMatchObject({ source_id: "crpc-s438", verified: true });
    const draft = await DraftModel.findById(res.body.draftId).lean();
    expect(draft!.supportCheck).toBe("failed");
  });
});

describe("quota and subscriptions", () => {
  let token: string;

  beforeAll(async () => {
    token = await login("adv.44444@chambers.test");
  });

  it("never passes upstream errors through to the client", async () => {
    // e.g. an SDK error carrying a status and the provider's raw message
    t.llm.respond = () => {
      throw Object.assign(new Error("Your credit balance is too low (request_id req_123)"), { status: 400 });
    };
    const res = await generate(token).expect(500);
    expect(res.body).toEqual({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  it("maps a rejected LLM request (no credit, bad key) to a clean 503", async () => {
    t.llm.respond = () => {
      throw new LlmError("misconfigured", "LLM rejected the request (400): credit balance is too low");
    };
    const res = await generate(token).expect(503);
    expect(res.body.error).toEqual({
      code: "llm_unavailable",
      message: "Drafting service is temporarily unavailable. Please retry shortly.",
    });
  });

  it("refunds quota when generation fails", async () => {
    t.llm.respond = () => {
      throw new LlmError("refusal", "declined");
    };
    const res = await generate(token).expect(422);
    expect(res.body.error.code).toBe("generation_refused");
    const me = await request(t.app).get("/subscriptions/me").set("authorization", `Bearer ${token}`).expect(200);
    expect(me.body.usage).toMatchObject({ draftsGenerated: 0, limit: 3 });
  });

  it("allows 3 free drafts a month, then 402", async () => {
    citeMixed();
    await generate(token).expect(201);
    await generate(token).expect(201);
    await generate(token).expect(201);
    const res = await generate(token).expect(402);
    expect(res.body.error).toMatchObject({ code: "quota_exceeded", plan: "free", limit: 3, used: 3 });
  });

  it("does not over-issue quota under concurrent requests", async () => {
    const racer = await login("adv.55555@chambers.test");
    const results = await Promise.all(Array.from({ length: 6 }, () => generate(racer)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 402)).toHaveLength(3);
  });

  it("creates a Razorpay subscription for checkout, and resumes it instead of creating another", async () => {
    const res = await request(t.app).post("/subscriptions").set("authorization", `Bearer ${token}`).expect(201);
    expect(res.body).toMatchObject({ subscriptionId: "sub_test_1", keyId: "rzp_test_key", status: "created" });
    const again = await request(t.app).post("/subscriptions").set("authorization", `Bearer ${token}`).expect(200);
    expect(again.body.subscriptionId).toBe("sub_test_1");
    expect(t.razorpay.created).toBe(1);
  });

  it("rejects webhooks with a bad signature", async () => {
    await request(t.app)
      .post("/webhooks/razorpay")
      .set("content-type", "application/json")
      .set("x-razorpay-signature", "deadbeef")
      .send(JSON.stringify(subscriptionEvent("subscription.activated", "active", 1_900_000_000)))
      .expect(400);
  });

  it("upgrades the user on subscription.activated and lifts the quota", async () => {
    const res = await signedWebhook(subscriptionEvent("subscription.activated", "active", 1_900_000_000), "evt_1").expect(200);
    expect(res.body.result).toBe("applied");

    const me = await request(t.app).get("/subscriptions/me").set("authorization", `Bearer ${token}`).expect(200);
    expect(me.body).toMatchObject({ plan: "pro", subscription: { status: "active" }, usage: { limit: 200 } });
    await generate(token).expect(201);
  });

  it("ignores duplicate deliveries and out-of-order older events", async () => {
    const dup = await signedWebhook(subscriptionEvent("subscription.activated", "active", 1_900_000_000), "evt_1").expect(200);
    expect(dup.body.result).toBe("duplicate");
    const stale = await signedWebhook(subscriptionEvent("subscription.halted", "halted", 1_800_000_000), "evt_old").expect(200);
    expect(stale.body.result).toBe("stale");
    const me = await request(t.app).get("/subscriptions/me").set("authorization", `Bearer ${token}`).expect(200);
    expect(me.body.plan).toBe("pro");
  });

  it("downgrades on cancellation", async () => {
    await signedWebhook(subscriptionEvent("subscription.cancelled", "cancelled", 1_900_100_000), "evt_2").expect(200);
    const me = await request(t.app).get("/subscriptions/me").set("authorization", `Bearer ${token}`).expect(200);
    expect(me.body).toMatchObject({ plan: "free", subscription: { status: "cancelled" } });
    await generate(token).expect(402);
  });
});
