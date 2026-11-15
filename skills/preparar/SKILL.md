---
name: preparar
description: Prepara o computador para o Pathfinder, instalando o componente gratuito que gera os PDFs e busca as vagas. Use quando as ferramentas do Pathfinder não estiverem disponíveis, quando setup_status disser que o componente está desatualizado, ou quando a pessoa disser "instalar", "preparar", "configurar o Pathfinder" ou "o Pathfinder não está funcionando".
---

# Preparar o computador

Pathfinder's tools run on Node.js 22 or newer, placed in the plugin's own data folder: a link to (or copy of) the Node.js already on the computer, or a private download from nodejs.org. The install needs no administrator password and does not change PATH or anything else on the computer. You run this skill on the first use, when the tools are missing, or when an update needs a newer runtime.

Talk to the person in Portuguese (Brazil) unless they write in another language. Use plain words. Never say MCP, Node, runtime, PATH, JSON or terminal command unless they ask; call it **"o componente"**.

**Only in Claude Code.** Pathfinder needs Claude Code: the desktop app's **Code** tab or the terminal. A plugin added in **Customize > Plugins** also loads in regular chat and in Cowork, where it cannot create files. Check before anything else. If you are in a claude.ai chat or a Cowork task, or you have no shell tool (Bash or PowerShell), say: "O Pathfinder funciona na aba **Code** do app do Claude. Abra a aba **Code**, comece uma sessão local (pode escolher a pasta **Documentos**) e escreva **começar**." Then stop.

**Never say the component is installed or ready unless the installer's output, in this conversation, has a line starting with `PRONTO:`.** A line starting with `ERRO:` or `FALTANDO:`, an empty output or a timeout means it is not ready. Report what the output says, never what you expected.

## The installer
These commands already hold the real folders of this computer. Use them exactly as written, with the Bash tool (or PowerShell on Windows) and a timeout of 300000:
- macOS (darwin) or Linux:
  `bash "${CLAUDE_PLUGIN_ROOT}/scripts/install-node.sh" "${CLAUDE_PLUGIN_DATA}"`
- Windows (win32), from Git Bash or PowerShell alike:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/install-node.ps1" -Dest "${CLAUDE_PLUGIN_DATA}"`

Append ` --check` (Windows: ` -Check`) to only look, or ` --verify` (Windows: ` -Verify`) to start Pathfinder once with what is installed. Neither installs anything.

- If the commands above show a dollar sign and braces instead of real folder paths, this text was opened as a file instead of loaded as a skill. Do not run them and do not guess the folders: load the `pathfinder:preparar` skill with the Skill tool, which fills them in.
- Never point the installer at another folder, never copy or download Node.js yourself, and never edit the plugin's files. Pathfinder only looks for the component in that one folder.
- Never run any other installer: no sudo, brew, apt, winget, choco or npm.

## 1. Check
- If the tool `mcp__plugin_pathfinder_pathfinder__setup_status` is available, call it. If `node_ok` is true, say everything is ready and go back to what the person wanted. If `node_ok` is false, the component is too old: go to step 2.
- Say "Vou conferir se o componente do Pathfinder já está no computador." and run the installer with ` --check`. The person may need to click **Permitir** (or **Yes**).
  - `FALTANDO:` → step 2.
  - `OK` → the component is already there, yet Pathfinder's tools are not in this conversation. **Do not install again and do not ask for another new session.** Go to step 5.
  - `ERRO:` → step 6.

## 2. Ask
Explain in two sentences: "Para gerar seus PDFs e buscar vagas, o Pathfinder precisa de um componente gratuito (o Node.js). Se ele já estiver no seu computador eu só aponto o Pathfinder para ele; se não, baixo do site oficial e guardo numa pasta só do Pathfinder. Não muda nada no resto do computador, não pede senha e leva 1 ou 2 minutos."

Ask with AskUserQuestion. Header "Instalar", options "Sim, pode instalar" and "Agora não". If they decline, say they can ask again anytime ("preparar o Pathfinder") and stop.

## 3. Install
Tell them: "Vai aparecer um pedido de permissão para rodar o instalador do Pathfinder. É só clicar em **Permitir** (ou **Yes**)."

Run the installer, with no flag. It ends by starting Pathfinder once to prove it works.
- The last line starts with `PRONTO:` → step 4.
- `ERRO:` → step 6.

## 4. Reconnect (once)
Claude loads Pathfinder's tools when a session starts, so it must reload them once. Give the step for where they are:
- **Terminal:** "Digite `/mcp`, escolha **pathfinder** e depois **Reconnect**. (Se preferir, feche e abra o Claude de novo.)" When they say they did, call `setup_status`. If it works, confirm in one line and continue with what they wanted, usually the `comecar` skill. If the tool is still missing, go to step 5.
- **App do Claude (desktop):** "Pronto, o componente está instalado e funcionando. Agora abra uma **nova sessão** na aba **Code** (botão **+** ou **New session**), na mesma pasta, e escreva **começar**. Se o Pathfinder pedir para instalar de novo, feche o app do Claude por completo e abra outra vez." Then stop: this session cannot load the tools.

## 5. Installed, but the tools are missing
This is a new session after an install, or a reconnect that did not work. Installing again would not help. Run the installer with ` --verify`.
- `PRONTO:` → the component works; Claude has not loaded Pathfinder's connection. Give these steps in one message:
  - **App do Claude:**
    1. "Feche o app do Claude **por completo**: no Mac, menu **Claude → Sair** (ou Cmd+Q); no Windows, feche a janela e também clique com o botão direito no ícone do Claude perto do relógio e escolha **Sair**."
    2. "Abra o app de novo e, em **Customize → Plugins**, confira se o Pathfinder está ligado."
    3. "Na aba **Code**, abra uma **sessão local nova** e escreva **começar**."
  - **Terminal:** "Feche o Claude (digite `/exit`), abra de novo e digite `/mcp`. Se o **pathfinder** aparecer com erro, escolha-o e depois **Reconnect**."
  - If they already did a full restart and the tools are still missing, do not repeat the steps. Say honestly that Pathfinder could not connect on this computer and ask them to report it at https://github.com/GabrielShaad/pathfinder/issues, with a screenshot of the message or of `/mcp`. Stop.
- `ERRO:` → step 6.
- `FALTANDO:` → the component disappeared; go back to step 2.

## 6. If it fails
Tell them the cause from the `ERRO:` line in one simple sentence, without the technical details.

If it says Pathfinder could not start ("não conseguiu iniciar"), the component is there but Pathfinder itself failed: ask them to update the plugin (**Customize → Plugins**, or `/plugin marketplace update pathfinder` in the terminal), open a new session and try again. If it still fails, ask them to report it at https://github.com/GabrielShaad/pathfinder/issues with the message. Stop.

Otherwise (the download failed or was blocked), give plan B:
1. "Baixe o instalador oficial em https://nodejs.org/pt/download (botão **LTS**, para o seu sistema), abra o arquivo e clique em **Avançar/Continuar** até o fim."
2. "Depois feche o app do Claude por completo, abra de novo, comece uma sessão nova na aba **Code** e escreva **preparar o Pathfinder**."

The installer finds that Node.js on its own and uses it without downloading anything. If the person already installed it and is still in this session, run the installer with ` --use-system` (Windows: ` -UseSystem`) appended, then follow step 4.

If it fails again, suggest checking the internet or company antivirus and trying later. Do not improvise other fixes.
