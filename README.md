# EducationGames Mail

EducationGames Mail is a private, website-only messaging platform. Invited users receive an account in this application. It does not currently connect to public SMTP, IMAP, POP3, Gmail, or Outlook.

## Email address format

Every account, group inbox, and custom sender uses the same address domain:

- Administrator: `admin@commga.com`
- Student: `andrew.holmes@commga.com`
- Developers group: `developers@commga.com`
- Testers group: `testers@commga.com`
- System sender: `no-reply@commga.com`

Users sign in with the part before the @ symbol (for example, `andrew.holmes`) or their full address. District codes remain account metadata for administration, but are no longer included in email addresses.

The application currently uses `@commga.com` as its internal mailbox namespace. Updating the addresses in this application does not, by itself, configure public Internet email. Sending to or receiving from Gmail, Outlook, or other external providers requires control of the `commga.com` domain, verified DNS records, and an authorized email service provider. These mailboxes are not official school-district accounts.

## Account model

- The first account is an administrator created through the one-time bootstrap process.
- Registration is invite-only. An administrator creates an invitation and chooses the student's district.
- The student opens the one-time invitation link, chooses a mailbox username, and sets a password.
- The server creates the final address as `username@commga.com`.
- Default district codes are `rsd400` (Richland School District) and `psd1` (Pasco School District).
- Administrators can add district codes, disable accounts, and revoke sessions.
- A user may save an account on a trusted device using a separate revocable device credential. Passwords are never stored in the browser.

## Architecture

- Cloudflare Worker: application API, authentication, internal message delivery, and static frontend.
- Cloudflare D1: accounts, district codes, invitations, sessions, message metadata, message bodies, and attachment bytes.
- GitHub: source control and GitHub Actions deployment.

Attachments are stored in D1 as 128 KiB BLOB chunks, with a 1 MiB combined attachment limit per message.

## Requirements

- Node.js 20+
- npm
- Cloudflare account with Workers and D1 access
- GitHub repository: `andrewholmes2011/educationgames-email`

## Local development

1. Run `npm install`.
2. Run `npx wrangler login`.
3. Copy `.dev.vars.example` to `.dev.vars` and set a random `BOOTSTRAP_SECRET` of at least 32 characters. Never commit `.dev.vars`.
4. Run `npm run db:local`.
5. Run `npm run dev` and open the local Wrangler URL.

## Production deployment

The repository includes `.github/workflows/deploy.yml`. Configure these GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN` — scoped to deploy Workers and manage D1.
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID.

The deployment workflow runs type checks and tests, applies pending D1 migrations, and deploys the Worker when deployment is enabled. Never commit an API token or bootstrap secret.

After creating the first administrator, set `ALLOW_BOOTSTRAP` to `false` in `wrangler.jsonc` and redeploy.

## Security notes

- Passwords are hashed with PBKDF2-SHA-256 and per-account salts.
- Session and remembered-device credentials are HttpOnly cookies; remembered-device tokens are stored hashed in D1.
- Login attempts are throttled.
- Internal message delivery only resolves active accounts, enabled group inboxes, and approved sender identities.
- Messages and attachments are stored in D1. Configure retention and backups before real-world rollout.
- Do not use saved-account sign-in on shared or public computers.

## Scope boundary

This is currently an internal website messaging service. It does not yet send or receive external email. To add public email, first verify ownership/control of `commga.com`, configure the required DNS records, select an email provider, and implement inbound/outbound provider integration with abuse controls.
