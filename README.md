# RACS2 — Roster & Cover System
A roster and shift-management system built for the Silverdale volunteer fire brigade with crew rotation scheduling, cover/stand-in requests, hour-balance tracking, and push notifications. This web-app is currently in use by real first responders, helping them co-ordinate and communicate using a feature rich, modern platform designed just for them.

## What it does

- **Crew rotation**: a crew based rotation cycle assigns crews to trucks day by day. Admins can reorder crews using an intuitive order picker rather than editing opaque backend numbers directly.
- **Roster generation**: bulk-generates shifts across a date range, filling seats (Eg. OIC, Driver, FF1–FF3) from each crew's members, respecting qualification requirements and per-appliance custom seat configuration.
- **Cover / stand-in requests**: members can post part or all of their shift for cover, others can accept full or partial time slices, with automatic time-splitting of the underlying assignment. Admins and moderators can act on a member's behalf.
- **Hour balance ledger**: tracks who's covered more shifts than they've had covered, with a full audit trail and month-ahead projections that stay consistent with actual roster generation.
- **Admin roster calendar**: a visual month editor for batching edits (cancel a shift, replace a crew, add an appliance) that commit atomically, with a draft/preview mode before publishing changes live.
- **Push notifications**: new cover requests, announcements, and stale-request reminders, with per-category opt-in preferences and a background sweep for time-based nudges.
- **Access control**: session-based auth (Member / Moderator / Admin), rate-limited login with account lockout.
- Leave requests, public holidays, qualification tracking, and brigade-wide announcements round out the admin toolset.

## Tech stack

- **Next.js 16** (App Router, Server Actions, Server Components)
- **TypeScript** throughout
- **PostgreSQL** (Neon serverless) via **Prisma 7** with the `@prisma/adapter-pg` driver adapter
- **Tailwind CSS**
- **Web Push API** (VAPID) for native push notifications, with a service worker for offline/PWA support
- **Vercel** for hosting, with Vercel Cron for the scheduled notification sweep


![Roster Grid Screenshot](docs/screenshotofroster.png)

(Names replaced with dashes for privacy)


