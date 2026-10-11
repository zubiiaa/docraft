# Docraft

Docraft is a lightweight collaborative document editor built for a short technical assessment. The app lets a signed-in user create documents, edit a rich-text body, share them with other seeded users, and import `.txt` or `.md` files.

## Key implemented features

- Create, rename, delete, and list documents from a workspace dashboard
- Rich-text editing with TipTap: bold, italic, underline, H1/H2/H3 headings, bullet lists, and numbered lists
- Autosave with conflict detection using document `version` numbers
- Document access model with `owner`, `editor`, and `viewer` roles
- Owner-only share controls for assigning or revoking access
- Imported `.txt` and `.md` content converted into the app's sanitized document JSON
- Seeded demo users for local testing and permission checks

## Technology stack

This project is implemented with the dependencies actually present in `package.json`:

- Next.js 16 with the App Router
- React 19 and TypeScript
- TipTap React + Starter Kit
- Mongoose + MongoDB
- Zod validation
- JOSE for signed JWT session cookies
- Marked for Markdown parsing
- Vitest for automated tests

## Prerequisites

- Node.js 20+ is the practical baseline for the project as configured
- A MongoDB instance or Atlas cluster
- A local `.env.local` file with `MONGODB_URI` and `AUTH_SECRET`
- Access to the project root directory in a terminal

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the project root with the required variables.

```env
MONGODB_URI="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/docraft?retryWrites=true&w=majority"
AUTH_SECRET="replace-with-a-long-random-string"
```

If you use a local MongoDB instance instead of Atlas, a valid alternative is:

```env
MONGODB_URI="mongodb://127.0.0.1:27017/docraft"
AUTH_SECRET="replace-with-a-long-random-string"
```

Do not commit real credentials or production secrets.

3. Seed the demo users:

```bash
npm run seed
```

This script creates or upserts the seeded users used by the login page and permission smoke test:

- zubia
- ashraf
- syeda

4. Start the application:

```bash
npm run dev
```

5. Open the app in a browser at:

```text
http://localhost:3000
```

## Required environment variables

The code explicitly reads these environment variables:

- `MONGODB_URI`: MongoDB connection string required by `src/lib/db.ts`
- `AUTH_SECRET`: required by `src/lib/auth/session.ts` for JWT signing and verification

The app does not read any other environment variables in the codebase as of this repository state.

## MongoDB Atlas setup requirements

If you are using MongoDB Atlas, the connection string should be placed into `MONGODB_URI`. In practice, that means:

- create or select a MongoDB Atlas cluster
- add a database user with a password
- whitelist your current IP address or use a permissive network policy for local testing
- use the connection string format provided by Atlas in `.env.local`

This project does not include a production deployment configuration or a live Atlas endpoint in the repo.

## Production build and tests

Use the scripts defined in `package.json`:

```bash
npm run build
npm run start
npm run test
npm run typecheck
npm run lint
```

The repository also includes a PowerShell smoke test for end-to-end permission checks against a running dev server:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
```

This script expects the database to be seeded and `npm run dev` to be running first.

## Demo users and seeded data

The seeded users are created by `scripts/seed.ts` and are intended for local demo workflows:

- zubia
- ashraf
- syeda

The login page uses `GET /api/users` to populate a list of demo users for login. This is a convenience mechanism for the assessment; it is not a production identity system.

## Deployment instructions and status

There is no deployment configuration or live URL checked into this repo. The current deployment status is therefore:

- Deployment status: Not configured / To verify
- Production deployment instructions: use a standard Next.js host (for example Vercel) and configure the same `MONGODB_URI` and `AUTH_SECRET` env vars in that environment

No live URL, production endpoint, or deployment manifest was found in the repository state inspected for this task.

## Known limitations and unfinished setup steps

- Authentication is demo-user based and not a full password system.
- The app supports only `.txt` and `.md` imports; no PDF export or richer import types are implemented.
- Sharing supports only `owner`, `editor`, and `viewer` roles.
- Real-time collaboration, comments, suggestion mode, and version history are not implemented.
- The project includes automated tests.

## Summary

Docraft is a functional assessment-ready demo for creating and sharing documents, with role-based permissions and a constrained rich-text editor. It is intentionally scoped to the code and flows currently present in the repository, and it does not claim broader collaboration or production-grade auth features beyond what the implementation actually provides.
