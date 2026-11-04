// Starts the bundled MCP server the way Claude Code does and checks that it answers.
//
//   <node> verify-server.mjs <node-command> <server.mjs> <scratch-dir>
//
// Called by install-node.sh and install-node.ps1 after an install, so the skill can tell
// "the file is there" apart from "Pathfinder really starts". <node-command> is the exact
// path .mcp.json uses (on Windows without ".exe"). <scratch-dir> becomes PATHFINDER_HOME,
// so nothing is written to the person's real folder; it is removed afterwards.
// Every message goes to stdout: Windows PowerShell 5.1 turns native stderr into errors.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const [command, server, scratch] = process.argv.slice(2);
if (!command || !server || !scratch) {
  console.log("uso: verify-server.mjs <node> <server.mjs> <pasta-temporaria>");
  process.exit(2);
}

let finished = false;
let stdout = "";
let stderr = "";
const child = spawn(command, [server], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PATHFINDER_HOME: scratch },
  windowsHide: true,
});

function finish(ok, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  child.kill();
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    // Best effort.
  }
  console.log(message);
  process.exit(ok ? 0 : 1);
}

const timer = setTimeout(() => finish(false, "o Pathfinder não respondeu em 60 segundos."), 60_000);

child.on("error", (error) => finish(false, `não foi possível executar ${command}: ${error.message}`));
child.on("exit", (code, signal) => {
  const tail = stderr.trim().split(/\r?\n/).slice(-3).join(" | ");
  finish(false, `o Pathfinder encerrou ao iniciar (${signal ?? `código ${code}`})${tail ? `: ${tail}` : "."}`);
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.stdout.on("data", (chunk) => {
  stdout += chunk;
  for (const line of stdout.split("\n")) {
    try {
      if (JSON.parse(line)?.result?.serverInfo?.name === "pathfinder") finish(true, "ok");
    } catch {
      // Not a complete JSON line yet.
    }
  }
});

child.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pathfinder-install", version: "0" } },
  })}\n`,
);
