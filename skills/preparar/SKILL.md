---
name: preparar
description: Prepara o computador para o Pathfinder, instalando o componente gratuito que gera os PDFs e busca as vagas. Use quando as ferramentas do Pathfinder não estiverem disponíveis, quando setup_status disser que o componente está desatualizado, ou quando a pessoa disser "instalar", "preparar", "configurar o Pathfinder" ou "o Pathfinder não está funcionando".
---

# Preparar o computador

Pathfinder's tools run on a private copy of Node.js kept in the plugin's own data folder. The install needs no administrator password and does not change PATH or anything else on the computer. You run this skill on the first use, or when an update needs a newer runtime.

Talk to the person in Portuguese (Brazil) unless they write in another language. Use plain words. Never say MCP, Node, runtime, PATH, JSON or terminal command unless they ask; call it **"o componente"**.

**Only in Claude Code.** Pathfinder needs Claude Code: the desktop app's **Code** tab or the terminal. A plugin added in **Customize > Plugins** also loads in regular chat and in Cowork, where it cannot create files. Check before anything else. If you are in a claude.ai chat or a Cowork task, or you have no shell tool (Bash or PowerShell), say: "O Pathfinder funciona na aba **Code** do app do Claude. Abra a aba **Code**, comece uma sessão local (pode escolher a pasta **Documentos**) e escreva **começar**." Then stop.

## 1. Check
- If the tool `mcp__plugin_pathfinder_pathfinder__setup_status` is available, call it.
  - If `node_ok` is true, say everything is ready and go back to what the person wanted.
  - Otherwise continue.
- If the tool is not available, the component is missing or the connection has not been reloaded since it was installed. Continue.

## 2. Ask
Explain in two sentences: "Para gerar seus PDFs e buscar vagas, o Pathfinder precisa de um componente gratuito (o Node.js). Vou baixá-lo do site oficial e guardar numa pasta só do Pathfinder: não muda nada no resto do computador, não pede senha e leva 1 ou 2 minutos."

Ask with AskUserQuestion. Header "Instalar", options "Sim, pode instalar" and "Agora não". If they decline, say they can ask again anytime ("preparar o Pathfinder") and stop.

## 3. Install
Tell them: "Vai aparecer um pedido de permissão para rodar o instalador do Pathfinder. É só clicar em **Permitir** (ou **Yes**)."

Run exactly one command with the Bash tool (timeout 300000). Pick it by the platform in your environment information:
- macOS (darwin) or Linux:
  `bash "${CLAUDE_PLUGIN_ROOT}/scripts/install-node.sh" "${CLAUDE_PLUGIN_DATA}"`
- Windows (win32), from Git Bash or PowerShell alike:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/install-node.ps1" -Dest "${CLAUDE_PLUGIN_DATA}"`

Never run any other installer: no sudo, brew, apt, winget or npm.

## 4. Reconnect
If the output has a line starting with `OK`, the component is installed. Claude must reload the Pathfinder connection once. Give the step for where they are:
- **Terminal:** "Digite `/mcp`, escolha **pathfinder** e depois **Reconnect**. (Se preferir, feche e abra o Claude de novo.)"
- **App do Claude (desktop):** "Abra uma nova conversa (botão **+** ou **New session**) na mesma pasta e digite **começar**."

Then call `setup_status` once more. If it works, confirm in one line and continue with what the person wanted, usually the `comecar` skill. If it still is not there, they have not reconnected yet: repeat the step in one line.

## 5. If it fails
The output starts with `ERRO:`. Tell them the cause in one simple sentence, without the technical details. Then give plan B:
1. "Baixe o instalador oficial em https://nodejs.org/pt/download (botão **LTS**, para o seu sistema), abra o arquivo e clique em **Avançar/Continuar** até o fim."
2. "Depois me avise que eu termino a configuração."

When they come back, run the same command with `--use-system` (Windows: `-UseSystem`) appended. It reuses the Node.js they just installed. Then follow step 4.

If it fails again, suggest checking the internet or company antivirus and trying later. Do not improvise other fixes.
