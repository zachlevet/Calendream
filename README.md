# Calendream

A Today-first life-planning app built with Expo, React Native, TypeScript, and SQLite.

## Run it

```bash
npm install
npm run ios
```

For the web build:

```bash
npm run web
```

The product direction and first milestone are documented in [PRODUCT.md](./PRODUCT.md).

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
- A compact native Today home in light and dark appearance
