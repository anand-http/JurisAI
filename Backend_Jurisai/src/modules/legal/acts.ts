/**
 * Canonical acts in the corpus and the ways lawyers (and models) refer to them.
 * Aliases are matched on word boundaries after lower-casing and stripping dots,
 * so "Cr.P.C." -> "crpc" and "BNS" does not match inside "BNSS".
 */
export const ACTS = {
  IPC: { name: "Indian Penal Code, 1860", aliases: ["ipc", "indian penal code"] },
  BNS: { name: "Bharatiya Nyaya Sanhita, 2023", aliases: ["bns", "bharatiya nyaya sanhita"] },
  CRPC: {
    name: "Code of Criminal Procedure, 1973",
    aliases: ["crpc", "cr pc", "code of criminal procedure", "criminal procedure code"],
  },
  BNSS: { name: "Bharatiya Nagarik Suraksha Sanhita, 2023", aliases: ["bnss", "bharatiya nagarik suraksha sanhita"] },
  IEA: { name: "Indian Evidence Act, 1872", aliases: ["iea", "indian evidence act", "evidence act"] },
  BSA: { name: "Bharatiya Sakshya Adhiniyam, 2023", aliases: ["bsa", "bharatiya sakshya adhiniyam"] },
  NIA: { name: "Negotiable Instruments Act, 1881", aliases: ["ni act", "negotiable instruments act", "nia"] },
  ICA: { name: "Indian Contract Act, 1872", aliases: ["indian contract act", "contract act", "ica"] },
  TPA: { name: "Transfer of Property Act, 1882", aliases: ["transfer of property act", "tp act", "tpa"] },
  CPC: {
    name: "Code of Civil Procedure, 1908",
    aliases: ["cpc", "c p c", "code of civil procedure", "civil procedure code"],
  },
} as const;

export type ActCode = keyof typeof ACTS;

export const isActCode = (value: string): value is ActCode => Object.hasOwn(ACTS, value);

export function normalizeLegalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9()]+/g, " ")
    .trim();
}

/** All acts referenced in a piece of text. */
export function detectActs(text: string): ActCode[] {
  const normalized = ` ${normalizeLegalText(text)} `;
  return (Object.keys(ACTS) as ActCode[]).filter((code) =>
    ACTS[code].aliases.some((alias) => new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`).test(normalized)),
  );
}
