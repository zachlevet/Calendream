# Engineering roadmap

## Foundation (complete)

- Thin route layer and feature-based source structure
- Local-first SQLite storage and browser-compatible data gateway
- Shared date/time rules and visual tokens
- Numbered, transactional SQLite migrations with integrity checks
- Portable local backup and validated transactional restore
- Startup and render recovery screens that preserve the database
- Reflection autosave and paginated timeline reads
- Automated lint, type, storage, migration, and product-rule checks

## Personal alpha (current)

- Finish Today creation and editing workflows
- Build practical habit creation, scheduling, completion, and editing
- Build week/month/quarter/year timeline summaries from the shared planning model
- Finish Settings and journal library presentation
- Test on a physical iPhone through a development build
- Complete a destructive-action, relaunch, and backup/restore test pass
- Calendream identity locked: product name, bundle identifier, URL scheme, app icon, launch mark, and favicon

## Guided onboarding

- Short interactive walkthrough using temporary sample previews that never enter the user database
- Guided explanation of Today, timeline zoom, and Plan
- Import-or-start-fresh decision at the end of onboarding
- Permission explanation before requesting Apple Calendar access
- Selectable, bounded, duplicate-safe import of iCloud, Google, and other calendars already connected to iPhone
- Calendar import and welcome-tour replay available later from Settings
- Next: add an optional first-backup reminder after a person has created or imported real data

## Private TestFlight

- Configure App Store Connect, signing, privacy answers, support details, and TestFlight notes
- Run an archive/build from the production EAS profile and distribute to internal testers
- Keep the first TestFlight local-only; require testers to export backups before build changes
- Treat calendar import as a one-way snapshot in the first TestFlight; direct Google OAuth and two-way sync come later
- Authentication and cloud sync after the local experience and data model are stable
- Replace the rules-based Plan parser with a calendar-aware mini-model assistant behind the backend: natural conversation, scoped calendar-reading tools, confirmed write actions, and durable conversation state
- TestFlight distribution
- Error reporting, analytics with consent, and accessibility review

## Later

- Mac layout
- Two-way external calendar sync after one-way, source-aware import is proven safe
- AI classification and morning suggestions
- People/call book and relationship reminders
