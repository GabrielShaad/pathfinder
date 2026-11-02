import { spawn } from "node:child_process";

// Opens a file or folder with the system's default app. No shell, so paths with
// spaces or accents need no quoting on any OS.
export function openWithSystem(path: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [path]]
      : process.platform === "win32"
        ? ["explorer.exe", [path]]
        : ["xdg-open", [path]];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => undefined);
  child.unref();
}
