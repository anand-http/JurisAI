const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Case- and whitespace-insensitive containment, the same rule the mobile client uses
 * to place citation chips, so server and client agree on what is still in the text.
 */
export function containsLoose(haystack: string, needle: string): boolean {
  const words = needle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  return new RegExp(words.map(escapeRegExp).join("\\s+"), "i").test(haystack);
}

/** Paragraphs are separated by one or more blank lines. */
export const splitParagraphs = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
