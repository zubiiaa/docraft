# Docraft Features

Docraft is a lightweight collaborative document editor built with Next.js, React, TypeScript, TipTap, and MongoDB. This document describes the implemented functionality and identifies the optional enhancements planned for the assessment.

## 1. Implemented Features

The following core features have been implemented and manually tested in the application.

### Document Management

- Create documents.
- Rename and delete existing documents.
- Edit and reopen documents.
- Automatically save document changes after approximately 800 ms of inactivity and persist them across browser refreshes.
- Display document ownership and editing status in the editor toolbar.

### Rich-Text Editing

- Bold, italic, and underline formatting.
- Heading styles using H1, H2, and H3.
- Bulleted and numbered lists.
- Persist document content and formatting.

### Comments and Version History

- Add document-level comments as an owner or editor; users with read access can view them.
- Create automatic history snapshots after approximately 10 seconds without edits, independently of the content autosave.
- Enforce a minimum 30-second interval between automatic snapshots on the server and skip snapshots when normalized title and content are unchanged.
- Preview a saved version in a read-only popup or restore it as the current document.

### Import and Export

- Import plain-text (`.txt`) files.
- Import Markdown (`.md`) files.
- Validate supported import formats.
- Export documents as plain text (`.txt`).
- Export Markdown (`.md`) with document structure and supported formatting.
- Export PDF (`.pdf`) with headings and list structure through the single `Export as` menu.
- Supported import formats: `.txt` and `.md`. DOCX and PDF import are not currently supported.

### Sharing and Access Control

- Identify document ownership.
- Share documents with another user.
- Distinguish owned documents from documents shared with the current user.
- Support owner, editor, and viewer access roles.
- Enforce document access permissions through server-side authorization checks.

### Validation and Testing

- Validate incoming data and document content.
- Handle invalid input and API errors.
- Include automated tests for access control, content validation, import conversion, PDF generation, and version-history policies including debounce reset, duplicate checks, the minimum interval, and restore no-op behavior.

## 2. Documentation Deliverables

These files document the project and its implementation:

- `README.md`: Project overview, setup instructions, configuration, and run commands.
- `ARCHITECTURE.md`: Application architecture, data flow, persistence, and design decisions.
- `AI_WORKFLOW.md`: AI tools, development workflow, and verification.
- `SUBMISSION.md`: Feature inventory and implementation status.

Before submission, ensure that the setup instructions, AI workflow details, and test commands accurately reflect the final project.

## 3. Remaining Optional Scope

These features are not implemented:

- Real-time collaboration indicators.
- Additional sharing permissions beyond the existing owner, editor, and viewer roles.

## 4. Known Scope and Limitations

- Import currently supports `.txt` and `.md` files, not DOCX or PDF.
- The editor's numeric document version is used for save-conflict detection; historical snapshots are stored separately.
- The history API returns the latest 25 snapshots. Automatic snapshots require the editor's inactivity timer to run; autosaved changes may not yet have a history entry if the page closes first.
- PDF export is lightweight and may not paginate very long documents or reproduce every formatting detail, such as underline, exactly.
- Real-time collaborative editing and live cursor or presence indicators are not included in the current core implementation.
- Suggestion mode is not included in the current implementation.
