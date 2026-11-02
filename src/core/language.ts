import type { Lang } from "./profile.js";

// Which language a posting is written in, from stopword counts. Good enough to pick
// the cover letter language; "unknown" when the text is too short to tell.

const STOPWORDS: Record<Lang, string[]> = {
  pt: ["de", "para", "com", "uma", "você", "voce", "nosso", "nossa", "são", "não", "também", "experiência", "vaga", "empresa", "trabalho", "conhecimento", "será", "das", "dos", "pelo", "pela"],
  en: ["the", "and", "you", "with", "our", "will", "are", "for", "this", "have", "experience", "team", "work", "your", "we", "of", "to", "in", "is", "be"],
  es: ["el", "los", "las", "con", "para", "una", "nuestro", "nuestra", "experiencia", "trabajo", "usted", "del", "por", "como", "tu", "sus", "empresa", "también", "será"],
};

export function detectLanguage(text: string): Lang | "unknown" {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (words.length < 20) return "unknown";
  const sample = words.slice(0, 600);
  const scores = (Object.keys(STOPWORDS) as Lang[]).map((lang) => {
    const set = new Set(STOPWORDS[lang]);
    return { lang, score: sample.filter((word) => set.has(word)).length };
  });
  scores.sort((a, b) => b.score - a.score);
  const [first, second] = scores;
  if (!first || first.score < 5) return "unknown";
  if (second && first.score < second.score * 1.2) return "unknown";
  return first.lang;
}
