# Docraft Features

Docraft is a lightweight collaborative document editor built with Next.js, React, TypeScript, TipTap, and MongoDB. This document describes the implemented functionality and identifies the optional enhancements planned for the assessment.

## 1. Implemented and Manually Verified

The following core features have been implemented and manually tested in the application.

### Document Management

- Create documents.
- Rename and delete existing documents.
- Edit and reopen documents.
- Save document changes and persist them across browser refreshes.
- Display document ownership and editing status in the editor toolbar.

### Rich-Text Editing

- Bold, italic, and underline formatting.
- Heading styles using H1, H2, and H3.
- Bulleted and numbered lists.
- Persist document content and formatting.

### Import and Export

- Import plain-text (`.txt`) files.
- Import Markdown (`.md`) files.
- Validate supported import formats.
- Export documents as plain text (`.txt`).
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
- Include automated tests for access control, content validation, and Markdown/plain-text import conversion.

## 2. Documentation Deliverables

These files document the project and its implementation:

- `README.md`: Project overview, setup instructions, configuration, and run commands.
- `ARCHITECTURE.md`: Application architecture, data flow, persistence, and design decisions.
- `AI_WORKFLOW.md`: AI tools, development workflow, and verification.
- `SUBMISSION.md`: Feature inventory and implementation status.

Before submission, ensure that the setup instructions, AI workflow details, and test commands accurately reflect the final project.

## 3. Optional Stretch Features

The following features are enhancements beyond the core assessment requirements. Their status must be updated after implementation and testing.

- Markdown export.
- Document-level commenting.
- Document version history with the ability to inspect and restore earlier versions.
- Real-time collaboration indicators.
- Additional sharing permissions beyond the existing owner, editor, and viewer roles.

## 4. Known Scope and Limitations

- Import currently supports `.txt` and `.md` files, not DOCX or PDF.
- Export currently supports plain text; Markdown export is a planned enhancement.
- The existing document version counter is used for save/version conflict handling. It should not be described as user-accessible version history unless historical snapshots and restoration are implemented.
- Real-time collaborative editing and live cursor or presence indicators are not included in the current core implementation.
- Comments and suggestion mode are not included in the current core implementation.
