import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Bundled Inter (OFL). Resolved from this module's location, which is dist/ in the
// plugin and src/render/ in development.
let cached: string | undefined;

export function fontsDir(): string {
  if (cached) return cached;
  const override = process.env.PATHFINDER_ASSETS;
  const starts = [override ? join(override, "..") : undefined, dirname(fileURLToPath(import.meta.url))].filter(Boolean) as string[];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 5; i++) {
      const candidate = join(dir, "assets", "fonts");
      if (existsSync(join(candidate, "Inter-Regular.ttf"))) return (cached = candidate);
      dir = dirname(dir);
    }
  }
  throw new Error("Fonts not found (assets/fonts/Inter-Regular.ttf). Reinstall the Pathfinder plugin.");
}

export const font = (name: "Regular" | "Bold" | "Medium" | "Italic") => join(fontsDir(), `Inter-${name}.ttf`);

// Ligatures turn "fi" into one glyph that ATS parsers read as garbage.
export const NO_LIGATURES = { liga: false, clig: false, dlig: false, calt: false } as const;
