# Calendream architecture

Calendream is a local-first Expo application. The iPhone and web apps share product models and feature code while platform-specific files provide persistence and native integrations.

## Boundaries

```text
src/app/                 Routes only; compose providers and feature screens
src/features/            Product experiences grouped by feature
src/hooks/               Cross-platform application state and data gateways
src/database/            SQLite provider, versioned migrations, backup format, and restore operations
src/models/              Domain types shared across features and storage
src/services/            External and native capabilities such as Maps
src/shared/              Pure reusable rules with no UI or persistence
src/theme/               Shared visual tokens
modules/                 Local Expo native modules
tests/                   Fast tests for pure product rules
```

Dependencies should point inward: routes can import features; features can import hooks, services, models, shared rules, and theme; shared rules and models must not import UI or database code.

## Data ownership

SQLite is the source of truth on native devices. The `useTodayData` gateway currently exposes Today-specific reads and commands. Its web counterpart is a non-persistent product preview. UI components do not issue SQL directly, except for the Settings data-maintenance boundary.

The native database uses numbered, transactional migrations. A migration must never delete the database or repopulate sample data when it encounters an error. If startup cannot verify the database, the app shows a recovery screen and keeps the file in place.

Portable backups are validated JSON envelopes with a format version, schema version, creation date, row limits, and corruption checksum. Restore validates the entire file, creates an on-device recovery copy, and replaces related tables inside one exclusive transaction. Backups can contain sensitive calendar and journal text and must never be logged or uploaded implicitly.

The welcome tour uses in-memory preview objects. It never writes sample events, tasks, goals, routines, or reflections into SQLite. A fresh database sees the tour once; an existing database automatically skips it so an app update cannot interrupt an established user. Settings can replay the same tour without changing existing data.

Apple Calendar import is an explicit, one-way snapshot. The user grants read access, selects calendars already connected to the iPhone, and chooses a bounded date range. Imported rows store provider, source-calendar, and source-event identities behind a unique index, so repeating an import skips duplicates—including an imported row the user later soft-deletes. The original Apple, iCloud, Google, or subscribed calendar is never modified. Imported events are included in portable backups with their source identities intact.

Future sync should be added behind a repository/sync boundary, preserving local writes as the immediate source of truth. Accounts, conflict resolution, and background synchronization should not be embedded in screens.

## Product model

All planning objects use an ISO local calendar date (`YYYY-MM-DD`) and a precision (`time`, `day`, `month`, `quarter`, `year`, or `someday`). `altitude` controls how far an object remains visible as the timeline zooms out.

Date-only values must be parsed as local dates. Do not pass them directly to `new Date(isoDate)`, which can shift the visible date because of UTC conversion. Use `src/shared/date.ts`.

## Change workflow

1. Create a focused branch from the latest stable branch.
2. Preserve behavior unless the branch explicitly changes product behavior.
3. Add or update tests for product rules, migrations, and storage boundaries.
4. Run `npm run check`.
5. For user-facing changes, also run the web export and inspect the iPhone build.

## Near-term evolution

- Split the remaining Today screen sections into feature-local components as they are changed.
- Move SQL commands behind repositories before cloud synchronization begins.
- Add end-to-end tests around creation, completion, rollover, backup/restore, and journal saving before wider TestFlight distribution.
- Keep calendar imports source-aware and idempotent so repeated imports cannot create duplicates.
- Add an explicit refresh/update policy before describing calendar import as synchronization; the current implementation intentionally imports new events without mutating prior imports.
