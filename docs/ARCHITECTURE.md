# Calendream architecture

Calendream is a local-first Expo application. The iPhone and web apps share product models and feature code while platform-specific files provide persistence and native integrations.

## Boundaries

```text
src/app/                 Routes only; compose providers and feature screens
src/features/            Product experiences grouped by feature
src/hooks/               Cross-platform application state and data gateways
src/database/            SQLite provider, schema, migrations, and seed data
src/models/              Domain types shared across features and storage
src/services/            External and native capabilities such as Maps
src/shared/              Pure reusable rules with no UI or persistence
src/theme/               Shared visual tokens
modules/                 Local Expo native modules
tests/                   Fast tests for pure product rules
```

Dependencies should point inward: routes can import features; features can import hooks, services, models, shared rules, and theme; shared rules and models must not import UI or database code.

## Data ownership

SQLite is the source of truth on native devices. The `useTodayData` gateway currently exposes Today-specific reads and commands. Its web counterpart provides the same interface with browser persistence. UI components do not issue SQL directly.

Future sync should be added behind a repository/sync boundary, preserving local writes as the immediate source of truth. Accounts, conflict resolution, and background synchronization should not be embedded in screens.

## Product model

All planning objects use an ISO local calendar date (`YYYY-MM-DD`) and a precision (`time`, `day`, `month`, `quarter`, `year`, or `someday`). `altitude` controls how far an object remains visible as the timeline zooms out.

Date-only values must be parsed as local dates. Do not pass them directly to `new Date(isoDate)`, which can shift the visible date because of UTC conversion. Use `src/shared/date.ts`.

## Change workflow

1. Create a focused branch from the latest stable branch.
2. Preserve behavior unless the branch explicitly changes product behavior.
3. Add or update tests for pure rules.
4. Run `npm run check`.
5. For user-facing changes, also run the web export and inspect the iPhone build.

## Near-term evolution

- Split the remaining Today screen sections into feature-local components as they are changed.
- Move SQL commands behind repositories before cloud synchronization begins.
- Introduce versioned schema migrations before distributing builds with real user data.
- Add Timeline and Habits as sibling features rather than extending the Today screen.
- Add end-to-end tests around creation, completion, rollover, and journal saving before TestFlight.
