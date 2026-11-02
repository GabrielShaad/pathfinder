import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// The person's working folder: visible, fixed, outside the plugin (which is replaced
// on every update), so it survives updates and uninstalls. Default:
// Documents/Pathfinder, respecting OneDrive on Windows and XDG on Linux.

function xdgDocuments(home: string): string | undefined {
  if (process.env.XDG_DOCUMENTS_DIR) return process.env.XDG_DOCUMENTS_DIR.replace(/^\$HOME/, home);
  try {
    const dirs = readFileSync(join(home, ".config", "user-dirs.dirs"), "utf8");
    const value = dirs.match(/^XDG_DOCUMENTS_DIR="?([^"\n]+)"?/m)?.[1];
    return value ? value.replace(/^\$HOME/, home) : undefined;
  } catch {
    return undefined;
  }
}

// A setting that was never filled can arrive as the literal "${user_config.pasta}".
const usable = (value: string | undefined) => (value && value.trim() && !value.includes("${") ? value.trim() : undefined);

export function defaultRoot(env = process.env, platform = process.platform, home = homedir()): string {
  const override = usable(env.PATHFINDER_HOME);
  if (override) return resolve(override.replace(/^~(?=$|[\\/])/, home));
  const candidates: string[] = [];
  if (platform === "win32") {
    for (const base of [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial]) {
      if (base) candidates.push(join(base, "Documents"), join(base, "Documentos"));
    }
    candidates.push(join(home, "Documents"), join(home, "Documentos"));
  } else if (platform === "linux") {
    const xdg = xdgDocuments(home);
    if (xdg) candidates.push(xdg);
    candidates.push(join(home, "Documents"), join(home, "Documentos"));
  } else {
    candidates.push(join(home, "Documents"));
  }
  const documents = candidates.find((dir) => existsSync(dir)) ?? home;
  return join(documents, "Pathfinder");
}

export interface Workspace {
  root: string;
  resumeDir: string;
  jobsDir: string;
  lettersDir: string;
  dataDir: string;
  searchesDir: string;
  originalDir: string;
  profile: string;
  preferences: string;
  jobsState: string;
  companies: string;
  readme: string;
  tracker: string;
}

export function workspace(root = defaultRoot()): Workspace {
  const dataDir = join(root, "dados");
  const jobsDir = join(root, "Vagas");
  return {
    root,
    resumeDir: join(root, "Meu currículo"),
    jobsDir,
    lettersDir: join(jobsDir, "Cartas"),
    dataDir,
    searchesDir: join(dataDir, "buscas"),
    originalDir: join(dataDir, "original"),
    profile: join(dataDir, "perfil.yaml"),
    preferences: join(dataDir, "preferencias.yaml"),
    jobsState: join(dataDir, "vagas.json"),
    companies: join(dataDir, "empresas.json"),
    readme: join(root, "LEIA-ME.txt"),
    tracker: join(jobsDir, "Acompanhamento de vagas.xlsx"),
  };
}

const README = `PATHFINDER: sua busca de emprego

Esta pasta é sua. O Pathfinder guarda tudo aqui, no seu computador.

  Meu currículo/   seu currículo pronto para enviar (PDF e Word)
  Vagas/           a lista de cada busca (PDF), a planilha de acompanhamento
                   e as cartas de apresentação (pasta Cartas)
  dados/           o que o Pathfinder sabe sobre você e as vagas já vistas.
                   Não precisa abrir; para mudar algo, peça ao Pathfinder.

Na planilha "Acompanhamento de vagas.xlsx" você pode marcar o status de cada
vaga (Aplicada, Entrevista...). Na próxima busca o Pathfinder mantém o que você
marcou. Feche a planilha antes de pedir uma nova busca.

O Pathfinder nunca se candidata por você: ele prepara, você decide e envia.
`;

export function ensureWorkspace(ws: Workspace): void {
  for (const dir of [ws.root, ws.resumeDir, ws.jobsDir, ws.lettersDir, ws.dataDir, ws.searchesDir, ws.originalDir]) mkdirSync(dir, { recursive: true });
  if (!existsSync(ws.readme)) writeFileSync(ws.readme, README.replace(/\n/g, process.platform === "win32" ? "\r\n" : "\n"), "utf8");
}

// Write to a temporary file, then rename: a crash never leaves half a file behind.
export function writeAtomic(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, data);
  renameSync(temp, path);
}

// Inside the workspace? Guards every path a tool is asked to open or write.
export function isInside(root: string, path: string): boolean {
  const base = resolve(root);
  const target = resolve(path);
  const sep = base.includes("\\") ? "\\" : "/";
  const a = process.platform === "win32" ? base.toLowerCase() : base;
  const b = process.platform === "win32" ? target.toLowerCase() : target;
  return b === a || b.startsWith(a.endsWith(sep) ? a : a + sep);
}

// Safe file names on every OS (no \ / : * ? " < > |, no trailing dots or spaces).
export function safeFileName(value: string, max = 80): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, "");
  return cleaned || "arquivo";
}
