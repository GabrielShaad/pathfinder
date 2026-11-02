# ADR-0007: One resume per person; cover letters only for the top jobs of a search

- Status: Accepted
- Date: 2026-11-02

## Context
Horizon tailors a resume per job: analyst, tailor, verifier and writer agents for each posting. That is slow and costly on a subscription, and more than a simplified, shareable tool needs. People still need letters in the posting's language, and an English resume for jobs abroad.

## Decision
- **One resume, ATS-oriented.** It targets the person's chosen roles and the requirements that recur in real postings for them, collected in the interview with a sample search.
- **Languages:** written in the profile's language. When the scope includes jobs abroad, an English version of the same content is added, with translated display fields stored in the profile (`i18n`, skill aliases).
- **Fact checking:** `verifyResume` (Horizon's `verifyTailored`) checks fact ids, numbers (pt-BR and en formats), skills and the current role. The `reviewer` agent checks meaning drift and translation fidelity.
- **Cover letters:**
  - only for the best N jobs of each search (N set in the interview, default 3);
  - in the posting's language, or a fixed language the person chose;
  - written by one `letter-writer` subagent per job, in parallel.
- **No per-job application answers.** Horizon's `answers.md` is not carried over.

## Consequences
- A search costs one scorer pass (at most 30 jobs) plus N short letters. Jobs scored before are never scored again.
- The resume is not tuned to each posting. The letter carries the job-specific match.
