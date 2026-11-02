# ADR-0003: Render PDFs with pdfkit instead of Typst

- Status: Accepted
- Date: 2026-11-02

## Context
Horizon renders resumes with the `typst` binary (its ADR-0004), installed with Homebrew. A shareable plugin cannot ask people to install Typst. A WASM build of Typst would add tens of megabytes and an API that is less proven in Node.

## Decision
Render every PDF with **pdfkit**, which is pure JavaScript and bundled. That covers the resume, the cover letters and the job list. The resume ports the layout of Horizon's `resume.typ`:
- one column;
- standard headings in the resume's language;
- each role's dates on the same line as the role;
- no tables, images or icons.

The bundled Inter font is used throughout, with ligatures off (`features: {liga: false, ...}`). DOCX output stays on the `docx` library. The job tracker uses `exceljs`.

Horizon's `checkPdf` read-back (unpdf) stays. It is localized to Portuguese, English and Spanish headings, and it runs on every build.

## Consequences
- The plugin needs no other program and produces identical output everywhere.
- Layout is code, not a template file, so it takes more effort to restyle.
- Tests render real PDFs and read them back, to catch ligatures, unreadable contacts, section order and dates.
