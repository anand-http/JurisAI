import type { DocumentTypeProfile } from "../documentTypes.js";

/**
 * Identity fields add nothing to legal retrieval and would otherwise be sent to the
 * embedding provider. Matched against form field keys, case-insensitively.
 */
const IDENTITY_FIELD =
  /name|address|phone|mobile|email|aadha+r|\bpan\b|pan_?(no|number)|father|mother|spouse|husband|wife|\bage\b|dob|birth|advocate|enrol|signature/i;

const MAX_FIELD_CHARS = 1_000;
const MAX_QUERY_CHARS = 2_000;

/** Step 1: retrieval query from the document type and the legally relevant form fields. */
export function buildRetrievalQuery(profile: DocumentTypeProfile, formFields: Record<string, string>): string {
  const substantive = Object.entries(formFields)
    .filter(([key, value]) => !IDENTITY_FIELD.test(key) && value.trim().length > 0)
    .map(([, value]) => value.trim().slice(0, MAX_FIELD_CHARS));

  const byField = profile.hintsByField;
  const fieldHints = byField ? (byField.hints[formFields[byField.field] ?? ""] ?? "") : "";

  return [profile.label, profile.retrievalHints, fieldHints, ...substantive]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_QUERY_CHARS);
}
