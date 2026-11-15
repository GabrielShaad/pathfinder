---
name: curriculo
description: Atualiza o perfil e o currículo da pessoa no Pathfinder (nova experiência, curso, idioma, correção de dados, troca de cargo-alvo ou de preferências de busca) e gera o currículo de novo em PDF e Word. Use quando a pessoa disser "atualizar meu currículo", "adicionar uma experiência", "mudei de emprego", "corrigir meu currículo", "mudar o cargo que busco" ou "mudar minhas preferências".
---

# Atualizar o currículo

Talk in Portuguese (Brazil) unless the person writes in another language. Use plain words and never mention tools or file formats.

**Only in Claude Code.** Pathfinder needs Claude Code: the desktop app's **Code** tab or the terminal. A plugin added in **Customize > Plugins** also loads in regular chat and in Cowork, where it cannot create files. Check before anything else. If you are in a claude.ai chat or a Cowork task, or you have no shell tool (Bash or PowerShell), say: "O Pathfinder funciona na aba **Code** do app do Claude. Abra a aba **Code**, comece uma sessão local (pode escolher a pasta **Documentos**) e escreva **começar**." Then stop.

**Never invent experience.** Add only what the person tells you now or what is already in the profile. Ask when something is vague: dates as month/year, what they did, numbers.

All Pathfinder tools are named `mcp__plugin_pathfinder_pathfinder__<tool>`.

1. Call `setup_status`.
   - If the tools are missing or `node_ok` is false, load the `pathfinder:preparar` skill with the Skill tool (do not read its file: the Skill tool fills in this computer's folders) and follow it.
   - If there is no profile, follow the `comecar` skill.
2. Call `get_profile`. Ask what they want to change, unless they already said.
   - **New job:** company, role, start month/year, and whether they still work there. If yes, set the end of the previous current role, asking its month and year. Ask 2–4 things they did or achieved there, with numbers if they know them. Add the role at the top, since roles go newest first. Facts get ids prefixed with the role id and `source: interview`.
   - **Other additions or fixes:** education, certification, language, skill, contact data. Edit only what they asked.
   - **Target role or search preferences:** update `target_titles`, `title_keywords`, `area`, `seniority`, `scope`, `workplace`, `salary_min` or `documents`, then call `save_preferences` with the whole object.
   - If English versions are needed (scope `both` or `global`), add English translations for anything new: `i18n.en`, skill `aliases`, `headlines.en`.
3. Before saving, read the changes back in one or two lines and ask "Posso salvar assim?". Then call `save_profile` with the whole profile: the full object, changed. Fix any error it reports.
4. If the change affects the resume, rebuild it:
   - Spawn `pathfinder:resume-writer` with the resume languages, the list from `save_preferences`' `resume_languages`.
   - Then spawn `pathfinder:reviewer`. If the verdict is FIX, run one more round.
   - A change to search preferences alone does not need a rebuild.
5. Say what changed and where the files are. Offer to open the PDF (`open_path` with `target: "resume"`). If they changed preferences, offer a new search (the `buscar-vagas` skill).
