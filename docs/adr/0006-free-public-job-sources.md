# ADR-0006: Search free public job sources only, Gupy through its portal page

- Status: Accepted
- Date: 2026-11-02

## Context
The audience is people in Brazil, in any field, looking for jobs in Brazil, remote jobs abroad, or both. Horizon's sources are tech-heavy: HN, Remote OK, and a watchlist of tech companies. Most Brazilian employers post on Gupy, which has no official public API. LinkedIn and Indeed forbid scraping.

## Decision
- **National:** Gupy, through the candidate portal's server-rendered search. `portal.gupy.io/job-search/term=<q>[&workplaceTypes[]=remote][&page=N]` embeds the results in `__NEXT_DATA__.props.pageProps.initialJobList`, 12 per page. Use:
  - at most 5 terms and 2–3 pages per search;
  - an identifying user agent and a pause between pages;
  - a missing or changed JSON block yields zero jobs, never an error.
- **Abroad (remote):**
  - Himalayas search (`country=BR`, pages via `?page=N`);
  - Jobicy (`geo=brazil|latam|anywhere`, industry from the area);
  - We Work Remotely RSS and Remotive, by category;
  - Remote OK, only for tech areas.
- **Mapping:** `config/areas.json` maps the person's area to each board's categories. The slugs were verified on 2026-11-02.
- **Company boards** (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee):
  - companies the agent finds by web search, through `add_companies_from_urls`;
  - for the tech areas, the seed list `config/companies-tech.json`, taken from Horizon's verified watchlist.
- **Filters:** eligibility and prescore are rewritten to follow the person's preferences: target titles, seniority, scope, workplace, city, languages and salary floor. They replace Horizon's hard-coded engineering and Brazil rules. A remote job open to many countries counts as international, not national.
- **Never:** LinkedIn or Indeed scraping, or paid APIs.

## Consequences
- Coverage is good for remote and Gupy-listed jobs. Companies hiring only on their own sites outside these ATS are missed.
- Jobicy and Remotive ask for attribution and a link to the original posting. The PDF list and the spreadsheet carry both.
- If Gupy changes its portal, national results drop to company boards until `parseGupyPage` is updated. The recorded fixture test catches the shape.
