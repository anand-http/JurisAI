import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { HttpError, notFound } from "../../lib/errors.js";
import { authUserId } from "../../middleware/auth.js";
import type { RateLimiters } from "../../middleware/rateLimits.js";
import { DraftModel } from "../../models/draft.model.js";
import { draftQuota, type QuotaReservation } from "../billing/quota.js";
import { getSource } from "../legal/legalStore.js";
import { renderDraftDocx } from "../export/docxRenderer.js";
import type { FileStorage } from "../export/fileStorage.js";
import { generateDraft, type DraftPipelineDeps } from "./generateDraft.js";
import { loadReviewIssues } from "./review/reviewIssues.js";
import { serializeDraft, serializeDraftSummary, serializeGenerated } from "./serializers.js";

const MAX_FIELD_VALUE = 20_000;
const MAX_TOTAL_FORM_CHARS = 60_000;

const GenerateBody = z.object({
  documentType: z.string().trim().min(1).max(100),
  formFields: z
    .record(z.string().min(1).max(100), z.string().max(MAX_FIELD_VALUE))
    .refine((f) => Object.keys(f).length <= 50, "at most 50 form fields")
    .refine(
      (f) => Object.values(f).reduce((n, v) => n + v.length, 0) <= MAX_TOTAL_FORM_CHARS,
      `form fields may total at most ${MAX_TOTAL_FORM_CHARS} characters`,
    ),
});

const UpdateBody = z.object({ draftText: z.string().min(1).max(200_000) });

/** `format` / `paperSize` are accepted for client compatibility; only DOCX is rendered today. */
const ExportBody = z
  .object({
    acknowledgeIssues: z.boolean().optional(),
    format: z.string().optional(),
    paperSize: z.string().optional(),
  })
  .optional();

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function draftObjectId(id: unknown): Types.ObjectId {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) throw notFound("Draft not found");
  return new Types.ObjectId(id);
}

export interface DraftRouteDeps extends DraftPipelineDeps {
  storage: FileStorage;
}

export function draftsRouter(deps: DraftRouteDeps, limiters: RateLimiters): Router {
  const router = Router();

  router.post("/generate", limiters.generate, (req, _res, next) => {
    GenerateBody.parse(req.body); // validate before reserving quota
    next();
  }, draftQuota(deps.config), async (req, res) => {
    const body = GenerateBody.parse(req.body);
    const quota = res.locals.quota as QuotaReservation;
    try {
      const { draft, reviewIssues } = await generateDraft(deps, { userId: authUserId(req), ...body });
      res.status(201).json(serializeGenerated(draft, reviewIssues));
    } catch (err) {
      await quota.release();
      throw err;
    }
  });

  router.get("/", async (req, res) => {
    const { page, limit } = ListQuery.parse(req.query);
    const filter = { userId: new Types.ObjectId(authUserId(req)) };
    const [items, total] = await Promise.all([
      DraftModel.find(filter)
        .select({ documentType: 1, status: 1, citations: 1, createdAt: 1, updatedAt: 1 })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DraftModel.countDocuments(filter),
    ]);
    res.json({ items: items.map(serializeDraftSummary), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  router.get("/:id", async (req, res) => {
    const draft = await DraftModel.findOne({ _id: draftObjectId(req.params.id), userId: authUserId(req) }).lean();
    if (!draft) throw notFound("Draft not found");
    res.json(serializeDraft(draft, await loadReviewIssues(draft, deps.store)));
  });

  router.put("/:id", async (req, res) => {
    const { draftText } = UpdateBody.parse(req.body);
    const draft = await DraftModel.findOneAndUpdate(
      { _id: draftObjectId(req.params.id), userId: authUserId(req) },
      { $set: { draftText, status: "edited", editedAt: new Date() } },
      { returnDocument: "after" },
    ).lean();
    if (!draft) throw notFound("Draft not found");
    res.json(serializeDraft(draft, await loadReviewIssues(draft, deps.store)));
  });

  router.get("/:id/citation/:source_id", async (req, res) => {
    const draft = await DraftModel.findOne({ _id: draftObjectId(req.params.id), userId: authUserId(req) })
      .select({ citations: 1, "retrieval.sourceIds": 1 })
      .lean();
    if (!draft) throw notFound("Draft not found");

    const sourceId = req.params.source_id;
    const citation = draft.citations.find((c) => c.sourceId === sourceId);
    // Only sources this draft actually cites or was grounded on; the endpoint is not a corpus browser.
    if (!citation && !draft.retrieval.sourceIds.includes(sourceId)) throw notFound("Citation not found on this draft");

    const source = await getSource(deps.store, sourceId);
    if (!source) {
      throw new HttpError(404, "source_not_found", "No source exists for this citation; it was not verified", {
        source_id: sourceId,
        verified: false,
      });
    }

    const metadata =
      source.sourceType === "statute"
        ? { act_name: source.actName, section_number: source.sectionNumber, section_title: source.sectionTitle }
        : { case_name: source.caseName, court: source.court, date: source.decisionDate, citation_text: source.citationText };

    res.json({
      source_id: source.sourceId,
      verified: citation?.verified ?? false,
      claimed_section: citation?.claimedSection ?? null,
      verification_detail: citation && !citation.verified ? (citation.detail ?? citation.reason) : null,
      source_type: source.sourceType,
      text: source.text,
      source_url: source.sourceUrl,
      metadata,
    });
  });

  /**
   * Export gate: a draft with open review issues (unverified citations, authorities without a
   * source, facts not traceable to the inputs, unfilled blanks) is only exported when the
   * lawyer explicitly acknowledges them. Each acknowledgement is recorded with the export.
   */
  router.post("/:id/export", limiters.export, async (req, res) => {
    const userId = authUserId(req);
    const draftId = draftObjectId(req.params.id);
    const acknowledged = ExportBody.parse(req.body)?.acknowledgeIssues === true;
    const draft = await DraftModel.findOne({ _id: draftId, userId })
      .select({ draftText: 1, documentType: 1, citations: 1, unlinkedMentions: 1, formFields: 1, retrieval: 1 })
      .lean();
    if (!draft) throw notFound("Draft not found");

    const issues = await loadReviewIssues(draft, deps.store);
    if (issues.length > 0 && !acknowledged) {
      throw new HttpError(
        409,
        "review_required",
        `${issues.length} item${issues.length === 1 ? "" : "s"} in this draft still need review before export`,
        { issues },
      );
    }

    const docx = await renderDraftDocx(draft.draftText);
    const key = `exports/${userId}/${draftId.toString()}/${Date.now()}.docx`;
    await deps.storage.put(
      key,
      docx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      `${draft.documentType}-${draftId.toString().slice(-6)}.docx`,
    );
    await DraftModel.updateOne(
      { _id: draftId },
      {
        $push: {
          exports: {
            key,
            format: "docx",
            createdAt: new Date(),
            acknowledgedIssues: issues.length,
            issueTypes: [...new Set(issues.map((i) => i.type))],
          },
        },
      },
    );

    const url = await deps.storage.signedUrl(key);
    // Local dev storage returns an API-relative path; answer on the host the client used.
    res.json({ fileUrl: url.startsWith("/") ? `${req.protocol}://${req.get("host")}${url}` : url });
  });

  return router;
}
