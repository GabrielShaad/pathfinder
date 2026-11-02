// Numbers are the easiest thing for a rewrite to inflate ("28%" → "30%"), so every
// number in generated text must already exist in the facts it cites.
//
// Facts may be written in Portuguese ("1.200 clientes", "12,5%") and the resume in
// English ("1,200 customers", "12.5%"), so each number token gets every plausible
// reading and a number is supported when any reading matches any reading of the facts.

// A digit not glued to a preceding letter ("Qwen3" yields nothing, "8B" yields 8),
// with separators and an optional k/m/mil/mi suffix.
const NUMBER = /(?<![\p{L}\d])(\d[\d.,]*\d|\d)(?:\s?(k|m|mil|mi|bi)(?![\p{L}]))?/giu;

function readings(token: string): number[] {
  const out = new Set<number>();
  const plain = Number(token);
  if (/^\d+$/.test(token)) out.add(plain);
  // en: 1,234,567.89  /  pt: 1.234.567,89
  const en = /^\d{1,3}(,\d{3})+(\.\d+)?$|^\d+\.\d+$/.test(token) ? Number(token.replaceAll(",", "")) : NaN;
  const pt = /^\d{1,3}(\.\d{3})+(,\d+)?$|^\d+,\d+$/.test(token) ? Number(token.replaceAll(".", "").replace(",", ".")) : NaN;
  for (const value of [en, pt]) if (Number.isFinite(value)) out.add(value);
  return [...out];
}

const MULTIPLIER: Record<string, number> = { k: 1_000, mil: 1_000, m: 1_000_000, mi: 1_000_000, bi: 1_000_000_000 };

// Every number token in the text, each with its plausible readings.
export function extractNumberTokens(text: string): { token: string; values: number[] }[] {
  const tokens: { token: string; values: number[] }[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const [whole, digits = "", suffix] = match;
    const factor = suffix ? MULTIPLIER[suffix.toLowerCase()] ?? 1 : 1;
    const values = readings(digits.replace(/[.,]$/, "")).map((value) => value * factor);
    if (values.length > 0) tokens.push({ token: whole.trim(), values });
  }
  return tokens;
}

export function extractNumbers(text: string): number[] {
  return extractNumberTokens(text).flatMap((token) => token.values);
}

// The number tokens in `text` that no reading of the sources supports.
export function unsupportedNumbers(text: string, sources: string[]): string[] {
  const allowed = new Set(sources.flatMap(extractNumbers));
  const missing = extractNumberTokens(text).filter((token) => !token.values.some((value) => allowed.has(value)));
  return [...new Set(missing.map((token) => token.token))];
}
