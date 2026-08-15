# Calendream

A Today-first life-planning app built with Expo, React Native, TypeScript, and SQLite.

## Run it

```bash
npm install
npm run ios
```

Calendream includes a local Swift MapKit module for Apple place autocomplete. Expo Go can still run the app with plain-text locations, but MapKit suggestions require Calendream's development build:

```bash
npx expo run:ios
```

After the first native build, TypeScript and styling changes continue to use fast refresh. Rebuild only after changing native Swift code or native dependencies.

For the web build:

```bash
npm run web
```

The product direction and first milestone are documented in [PRODUCT.md](./PRODUCT.md).
The codebase boundaries and development workflow are documented in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), with sequencing in [docs/ROADMAP.md](./docs/ROADMAP.md).

Before committing a change, run:

```bash
npm run check
```

## Project status

This repository is the production application foundation. The separate `horizon-share` repository remains the disposable HTML interaction prototype.

Personal Alpha 0.1 currently supports:

- SQLite-backed tasks and events
- Create, edit, and soft-delete item sheets
- Persistent task completion
- Persistent daily notes
- Dynamic Up Next state
- Upcoming-event countdown pills for the next 120 days
- A first-open morning review for unfinished past tasks
- Rollover actions to move a task to Today, choose another date, or dismiss it
- Apple MapKit place suggestions, structured locations, and Open in Maps actions
- A compact native Today home in light and dark appearance
