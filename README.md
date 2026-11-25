# EducationGames Mail

EducationGames Mail is a **site-only private messaging platform**. It gives invited students their own mailbox inside this website. It does not connect to public SMTP, IMAP, POP3, or Internet email.

## Address format

A student's mailbox is generated as:

`username@students.<district-code>.holmes`

Examples:

- `andrew@students.rsd400.holmes` — Richland School District code `rsd400`
- `alex@students.psd1.holmes` — Pasco School District code `psd1`

The `.holmes` suffix is an application-internal namespace, not a registered public domain. These addresses are not official school district accounts, are not verified by the districts, and cannot receive or send public Internet email. The platform only delivers messages between active EducationGames Mail accounts.

## Account model

- The first account is an administrator created through the one-time bootstrap process.
- Registration is invite-only. An administrator creates an invitation and chooses the student's district.
- The student opens the one-time invitation link, chooses their mailbox username, and sets a password (12–200 characters).
- The server generates the final address. The student cannot choose a different district from the one on the invitation.
- Default district codes are `rsd400` (Richland School District) and `psd1` (Pasco School District). Administrators can add other district codes while creating invitations.
- Administrators can disable accounts and revoke their sessions.

## Architecture

- **Cloudflare Worker:** application API, authentication, message delivery, static frontend.
- **Cloudflare D1:** accounts, district codes, invitations, sessions, message metadata and message bodies.
- **Cloudflare R2:** private attachment objects.
- **GitHub:** source control and optional GitHub Actions deployment.

There is deliberately no Email Routing or Email Sending binding: the requested `.holmes` addresses are not real Internet domains. Internal message delivery happens directly through the Worker and D1.

## Requirements

- Node.js 20+
- npm
- Cloudflare account with Workers, D1, and R2 access
- GitHub account/repository (`andrewholmes2011/educationgames-email`)

## Local development

```bash
npm install
npx wrangler login
npx wrangler d1 create educationgames-mail-db
npx wrangler r2 bucket create educationgames-mail-files
```

Copy the D1 database ID printed by Wrangler into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

Create `.dev.vars` from `.dev.vars.example` and set a random `BOOTSTRAP_SECRET` of at least 32 characters. Do not commit `.dev.vars`.

Apply the local migration and start the Worker:

```bash
npm run db:local
npm run dev
```

Open the local Wrangler URL. On first visit, create the administrator using the bootstrap secret. The administrator mailbox is `admin@staff.educationgames.holmes`.

## Production Cloudflare setup

Create the D1 database and R2 bucket if you have not already:

```bash
npx wrangler d1 create educationgames-mail-db
npx wrangler r2 bucket create educationgames-mail-files
```

Update the `database_id` in `wrangler.jsonc`. Then configure the production bootstrap secret:

```bash
npx wrangler secret put BOOTSTRAP_SECRET
```

Use a unique random secret of at least 32 characters. Apply the production schema and deploy:

```bash
npm run db:remote
npm run typecheck
npm test
npx wrangler deploy
```

After creating the first administrator, set `ALLOW_BOOTSTRAP` to `false` in `wrangler.jsonc` and redeploy. The API also refuses a second bootstrap once any user exists, but disabling the endpoint is an important defense-in-depth step.

Cloudflare will provide a `workers.dev` URL if enabled for your account. A custom site hostname can be attached later; it is not required for the internal `.holmes` mailbox namespace.

## GitHub deployment

The repository includes `.github/workflows/deploy.yml`. Configure these GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN` — scoped to deploy Workers and manage the needed D1/R2 resources.
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID.

Push to `main` to run checks. The deployment step is intentionally gated: after the D1 database and R2 bucket exist, the database ID is configured, and the Cloudflare token/account secrets are saved, add the repository Actions variable `CLOUDFLARE_DEPLOY_ENABLED=true` to enable deployment. The D1 database ID must already be committed in `wrangler.jsonc`; do not commit any API token or bootstrap secret.

## Features

- Invite-only account creation with district-scoped addresses.
- Password hashing using PBKDF2-SHA-256 with per-account salts.
- HttpOnly, SameSite=Strict session cookies.
- Login throttling by hashed client IP.
- Private inbox, sent, archive, trash, and search.
- Internal delivery to other active mailboxes only.
- File attachments stored in private R2 objects.
- Administrator mailbox list, invitations, district-code creation, and account disabling.
- Security headers and same-origin mutation checks.
- Email body text is rendered as text; untrusted email HTML is not executed.

## Security and operational notes

- Do not use this project to imply that a mailbox is an official account issued by a school district. The `.holmes` namespace is owned by this application only.
- An invitation is a bearer credential. Share it privately and treat it as single-use.
- Use HTTPS in production. The session cookie is marked `Secure` automatically for HTTPS requests.
- Before a real student rollout, add Cloudflare Turnstile, stronger abuse controls, password recovery, audit log retention, backups/restore drills, and a published privacy/acceptable-use policy.
- This initial deployment is not a guarantee of uninterrupted availability. Cloudflare service health, account limits, and your deployment configuration determine uptime.
- Messages are stored in D1 and attachments in R2. Set appropriate retention and deletion policies before real-world student use.

## Scope boundary

This is an internal website messaging service. It cannot send mail to Gmail/Outlook or receive mail from them. It does not create real mailboxes on district-owned domains. Adding public email later would require a domain you own, verified DNS, provider configuration, anti-abuse controls, and a deliberate change to the product's scope.
