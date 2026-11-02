---
name: buscar-vagas
description: Busca vagas para a pessoa (no Brasil e remotas no exterior, conforme as preferências), avalia cada uma, escreve cartas de apresentação para as melhores e entrega a lista no chat, em PDF e numa planilha de acompanhamento. Use quando a pessoa disser "buscar vagas", "procurar emprego", "vagas novas", "tem vaga pra mim?", ou contar que se candidatou ou avançou numa vaga ("apliquei", "tenho entrevista") para atualizar o acompanhamento.
---

# Buscar vagas

Talk in Portuguese (Brazil) unless the person writes in another language. Use short messages and plain words. Never mention tools, agents, JSON or APIs.

**Only in Claude Code.** Pathfinder needs Claude Code: the desktop app's **Code** tab or the terminal. A plugin added in **Customize > Plugins** also loads in regular chat and in Cowork, where it cannot create files. Check before anything else. If you are in a claude.ai chat or a Cowork task, or you have no shell tool (Bash or PowerShell), say: "O Pathfinder funciona na aba **Code** do app do Claude. Abra a aba **Code**, comece uma sessão local (pode escolher a pasta **Documentos**) e escreva **começar**." Then stop.

Hard rules:
- **Never apply** to a job, fill a form or contact anyone for the person. Pathfinder prepares; the person decides and applies.
- The search runs only now, in this conversation. There is no schedule.
- Never invent experience in letters or answers.

All Pathfinder tools are named `mcp__plugin_pathfinder_pathfinder__<tool>`.

## Progress updates (no search needed)
If the person reports progress ("apliquei na vaga da Acme", "tenho entrevista", "não passei", "descarta essa"), call `update_job_status` with the job's code (`ref`) and the status:
- Quero aplicar
- Aplicada
- Entrevista
- Proposta
- Não avançou
- Descartada

Use `get_jobs` or the last list if you need to find the code. Confirm in one line and stop, unless they also want a search.

## 1. Ready?
Call `setup_status`.
- If the tool does not exist or `node_ok` is false, follow the `preparar` skill first.
- If `has_profile` or `has_preferences` is false, explain in one line and follow the `comecar` skill.

## 2. Search
Say "Vou buscar vagas agora; leva 1 ou 2 minutos." and call `search_jobs`.

If `funnel.eligible + funnel.unclear` is below 15 and you have the WebSearch tool, widen the search once:
1. Run 2–3 searches for the person's main target titles in English, on company job boards. Example: `site:jobs.lever.co OR site:boards.greenhouse.io OR site:jobs.ashbyhq.com "Marketing Analyst" (Brazil OR LATAM)`.
2. Pass the job URLs you find to `add_companies_from_urls`. In `names`, give company names by board token when the result makes them obvious.

If WebSearch is not available, skip this step without comment.

If every source failed (`runs` all with `error`), say the job sites did not answer, suggest trying again later, and stop.

## 3. Score
If `to_score` is not empty:
1. Spawn the `pathfinder:job-scorer` agent with exactly those refs (from both `search_jobs` and `add_companies_from_urls`).
2. Wait for it.

Jobs scored in earlier searches keep their scores, so they are never scored twice.

## 4. Cover letters
Read `documents.letters_per_search` (N) from `get_profile`. If N is above 0:
1. **Pick the jobs.** Take the best N jobs from this search with verdict `apply` and no letter yet. If there are fewer than N, fill the rest with the best `maybe` jobs that score 65 or more. Use `export_jobs`' `top` list, or the scores you just saved.
2. **Choose each letter's language.**
   - If `documents.letters_language` is `pt` or `en`, use that.
   - If it is `job`, use the posting's language (`posting_language` from `get_jobs`): pt, en or es. When it is unknown, use `documents.main_language`.
3. **Write them.** Spawn one `pathfinder:letter-writer` agent per job, all in the same message so they run in parallel. Give each one the ref and the language.

## 5. Export
Call `export_jobs`.
- If `tracker_locked` is true, say: "A planilha estava aberta, então salvei uma cópia atualizada com outro nome. Feche a planilha antes da próxima busca."
- If `edits_imported` is above 0, say you kept what they had marked in the spreadsheet.

## 6. Hand over
Keep it short:
1. **One line with the funnel**, e.g. "Li 327 vagas, 79 passaram pelos seus filtros, avaliei 30 e estas são as melhores:".
2. **A table of the top jobs** (up to 10, best first): Nota | Vaga | Empresa | Onde | Por que combina. Put the link in the Vaga column as `[Cargo](url)`. Mark with ✉️ the jobs that got a letter.
3. **Files:**
   - the PDF list and the spreadsheet (paths from `export_jobs`);
   - the letters folder (`Vagas/Cartas`);
   - the resume in "Meu currículo". For jobs in English, point to the "Resume - ..." files.
4. **Next steps** in two lines: "Abra o link de cada vaga, confira os requisitos e se candidate pelo site da empresa. Depois me conte (por exemplo 'apliquei na vaga 1') que eu atualizo sua planilha."

Offer to open the PDF list or the spreadsheet (`open_path`). If nothing passed the filters, say so honestly. Then suggest widening the search (another title, "Os dois" for national + abroad, hybrid). If they agree, update the preferences with `save_preferences` (pass the whole object back, changed) and search again.
