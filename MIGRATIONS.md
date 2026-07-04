# Prisma Migrations

This project now has a formal Prisma migration history. Treat migrations as the source of truth for database structure.

## Current migration

`prisma/migrations/20260525000000_initial_schema/migration.sql` is a baseline migration generated from the current Prisma schema. It creates the current Heimdell Verified Consent schema, including:

- core consent tables
- AES-GCM encrypted account storage column
- organization/user/membership models
- role and API key status enums
- dashboard/admin audit log table

The migration does not update, decrypt, re-encrypt, print, or expose sensitive values.

`prisma/migrations/20260525001000_add_user_external_auth_id/migration.sql` adds `User.externalAuthId` for Supabase Auth identity mapping. It is additive and does not modify consent records.

`prisma/migrations/20260526000000_add_webhook_retry_fields/migration.sql` adds durable retry tracking fields to `Notification` for outbound webhook delivery. It is additive, gives existing rows safe defaults for `attempts` and `maxAttempts`, and does not modify payloads or sensitive consent data.

Webhook signing secrets now use an encrypted storage format inside the existing nullable `Client.webhookSecret` text field. No Prisma schema migration is required for that hardening because the column already stores text. New and rotated dashboard secrets are saved as AES-256-GCM envelopes using `v1:<iv>:<auth_tag>:<ciphertext>`. Existing plaintext development/demo values remain readable for backward-compatible delivery, but production should rotate those secrets or run a future reviewed data migration that re-encrypts them in place after a backup. Do not print old plaintext secrets or encrypted blobs during that migration.

## Fresh development database

For a brand-new local or hosted development database:

```bash
npm run db:validate
npm run db:migrate:dev
npm run db:generate
npm run seed:dev-client
```

Use `npm run db:migrate:dev` only for development databases. It may create development-only migration bookkeeping and can prompt when drift is detected.

## Existing development database created with db push

Earlier project phases used `prisma db push`. If your local database already has tables but no Prisma migration history, do not blindly run `npm run db:migrate:dev` unless you are prepared to resolve drift.

Safe options:

1. Keep the existing dev DB only for temporary manual testing and create a fresh development database for migration-based work.
2. If the existing schema exactly matches this baseline, mark the baseline as already applied with Prisma's `migrate resolve` command after backing up. Do this only after inspecting the database.
3. If old rows contain base64 placeholder `encryptedAccountNumber` values, recreate those dev records. The app now expects AES-256-GCM values formatted as `v1:<iv>:<auth_tag>:<ciphertext>`.

Do not reset or wipe a database unless Andy explicitly chooses that path.

## Production databases

Production must use migrations, not `db push`.

Safe production flow:

1. Confirm the target environment is production.
2. Take a database backup.
3. Store the backup location and timestamp outside the app repo.
4. Review every SQL file under `prisma/migrations/`.
5. Run `npm run db:validate`.
6. Apply with `npm run db:migrate:deploy`.
7. Run application smoke tests.

Never run `npm run db:push` against production. `db push` is useful for rapid local prototyping only; it bypasses migration history and can make drift harder to reason about.

## Backup checklist

Before applying migrations to any non-disposable database:

- Identify the database host and environment.
- Confirm `.env.local` or the hosting secret points to the intended database.
- Export a backup with the provider's backup tool or `pg_dump`.
- Confirm the backup completed successfully.
- Review migration SQL for table drops, column drops, enum changes, and data updates.
- Confirm no migration prints or transforms secrets unexpectedly.
- For webhook retry migrations, confirm queued webhook rows have expected `attempts`, `maxAttempts`, and `nextAttemptAt` values before scheduling the worker in production.
- For webhook secret storage hardening, confirm any legacy plaintext `Client.webhookSecret` rows are rotated or encrypted through a reviewed, non-destructive data migration before production rollout.
- Apply migrations during a quiet window.
- Keep rollback instructions nearby.

## Sensitive data notes

Do not log, export into tickets, or paste into chat:

- `DATABASE_URL`
- raw API keys
- `apiKeyHash`
- raw verification tokens
- `tokenHash`
- `encryptedAccountNumber`
- full bank account numbers
- webhook secrets

Only `accountNumberLast4` is safe for display.

## Connection pooling and migrations

If `DATABASE_URL` points at a transaction-mode connection pooler (e.g.
Supabase's port-6543 pooler), `prisma migrate dev`/`status`/`deploy` can hang
indefinitely with no error — these commands need session-level locks that
transaction pooling doesn't support. Set a second `DIRECT_URL` in `.env.local`
pointing at a session-mode or direct connection (Supabase: the "Session
pooler" option, still IPv4-compatible unlike the direct connection) and add
`directUrl = env("DIRECT_URL")` to the `datasource` block — Prisma uses it
automatically for migration commands while the app keeps using the pooled
`DATABASE_URL` at runtime.

## Commands

| Command | Use |
|---|---|
| `npm run db:validate` | Validate Prisma schema with `.env.local` loaded |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:migrate:dev` | Create/apply migrations in development only |
| `npm run db:migrate:deploy` | Apply committed migrations in deployed environments |
| `npm run db:studio` | Open Prisma Studio for inspection |
| `npm run db:push` | Dev-only prototyping; do not use for production |
