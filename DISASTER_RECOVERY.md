# Disaster Recovery & Uptime Monitoring

This documents what actually exists today for backups and outage detection, and what's
missing. It's written plainly on purpose — this is the kind of document that's useless if it
overstates what's actually protected.

## Uptime monitoring (in place)

`.github/workflows/uptime-check.yml` hits `https://telecomcompliance.uk/api/health/deep` every
~15 minutes. That endpoint (unlike the original `/api/health`) actually runs a database query, so
it catches the class of failure that took the site down during the July 2026 password rotation
incident — a shallow "is the server responding" check would have reported healthy the whole time.

If a check fails, the GitHub Actions run goes red and GitHub emails the repository owner by
default (Settings → Notifications on GitHub controls this — check it's turned on for Actions).
There's no SMS/phone alert and no on-call rotation; for a one-person team that's a reasonable
starting point, not a final answer.

## Database backups (⚠️ the real gap)

The production database is hosted on Supabase's **Free tier**. Free-tier Supabase projects do
**not** include automated daily backups or point-in-time recovery — those are paid-plan features
(check Supabase's current pricing page for exact tiers, since this changes). In practice, today,
if the database were accidentally dropped, corrupted, or a bad migration ran against it, **there
is no automatic way to restore it.**

For a company whose entire product is tamper-evident evidence records, this is the single
biggest operational risk on the platform right now — worth fixing before this is relied on for
real disputes at scale.

### Recommended fix

Upgrade the Supabase project to a paid plan with backups enabled (Pro tier and above include
daily backups; point-in-time recovery is a further add-on on some tiers). This is a cost decision
for you to make, not something to change silently.

### Interim manual backup (until upgraded)

Until a paid plan with automated backups is in place, take a manual backup periodically:

1. In the Supabase dashboard, go to **Database** → **Backups** (or **Database** → **Backup &
   Restore**, naming varies by dashboard version) and check what's already available for your
   plan.
2. If no built-in export is available on the Free tier, use `pg_dump` against the **Session
   pooler** connection string (the same one used for `DIRECT_URL`) from a machine with PostgreSQL
   client tools installed:
   ```
   pg_dump "<your DIRECT_URL connection string>" -F c -f heimdell-backup-$(date +%Y%m%d).dump
   ```
3. Store the resulting file somewhere separate from Supabase itself (a private cloud storage
   folder, encrypted if it contains real customer data — which it does).

This is a manual, easy-to-forget process. If a real backup schedule matters (and it should), the
paid-plan automated backup is the actual fix, not a recurring manual task.

## Recovery procedure (if data loss happens)

1. Stop write traffic if possible (this may mean taking the site offline briefly).
2. Restore the most recent backup into a new Supabase project or the existing one, following
   Supabase's restore documentation for whatever plan/backup type is in use at the time.
3. Update `DATABASE_URL` / `DIRECT_URL` in Netlify if the restore target is a new project.
4. Run `npm run db:migrate:deploy` if the restored backup predates the latest migrations.
5. Smoke-test: log in, load `/dashboard/clients`, open a recent certificate.
6. Notify affected client companies per the `/complaints` process if any of their data was
   affected.

## Contact

Incidents: andrew@heimdell-tech-ai.co.uk
