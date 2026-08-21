# TestFlight readiness

## Phase 1 — local data safety

Completed in the local-first release foundation:

- Fresh installs begin empty; startup no longer inserts demo records.
- Existing installs retain their current records during numbered migrations.
- Every migration runs transactionally and the database is checked for foreign-key and integrity problems.
- Database startup and React render failures show recoverable screens instead of silently resetting data.
- Daily reflections autosave after typing pauses, on blur, and when the app backgrounds.
- Timeline reads paginate instead of dropping everything after 500 records.
- Settings provides portable backup export, validated restore, data counts, database health, and explicit removal of known sample records.
- Restore and sample removal create a private on-device recovery copy before changing data.

Automated verification completed on August 20, 2026:

- Lint and TypeScript checks pass.
- All 58 automated tests pass.
- Expo Doctor passes all 21 checks.
- The production iOS JavaScript export and native Release simulator build pass.
- Xcode 27 beta currently fails when linking the Debug-only prebuilt React Native libraries. Use the Release configuration or a supported stable/EAS Xcode image for release validation; this does not affect the successful Release build.

Manual acceptance pass before onboarding:

1. Install over the current development build and verify all existing data remains.
2. Create, edit, complete, reorder, and delete both a task and event.
3. Create and edit a routine; verify future generated occurrences change without changing history.
4. Add a reflection, immediately background the app, relaunch, and verify the text.
5. Export a backup to Files, add a disposable item, restore the backup, and confirm the disposable item is gone while backed-up data returns.
6. Relaunch after force-quitting and after restarting the iPhone.
7. Exercise Today, Week, Month, Quarter, and Year with enough data to scroll both directions.
8. Test airplane mode. All core planning behavior must continue to work.

## Phase 2 — onboarding and calendar import

Implemented as a short interactive setup rather than a required tutorial video. The tour can be replayed from Settings.

The first-run path now:

1. Explain the Today page in one sentence.
2. Demonstrate Today, timeline zoom, and Plan with in-memory sample previews.
3. Offer calendar import with a clear permission explanation.
4. Let the user select calendars and a bounded time range.
5. Import into the local database or finish with an entirely fresh calendar.

The initial import uses Apple EventKit through Expo Calendar to read calendars already configured on the iPhone. That includes iCloud and Google calendars connected in iOS Settings. Source calendar and event identities make repeated imports duplicate-safe. Import is explicitly one-way: it does not alter the source calendar or continuously synchronize later edits. Direct Google OAuth and two-way synchronization wait until conflict rules are designed.

Acceptance notes:

- Existing users with local data automatically skip first-run onboarding.
- Tour sample data is never inserted into the database.
- Replaying the tour from Settings never clears existing data.
- Calendar permission is requested only after the person chooses import.
- Birthday and subscribed calendars are excluded from the default selection but remain available.
- Multi-day imports become trips; timed and all-day imports retain their appropriate precision.
- Calendar import can be run again from Settings and skips existing source events.
- Calendar source identities survive backup export and restore.

Remaining before Phase 3:

1. Test first-run onboarding on a clean simulator or spare device.
2. Test import with iCloud, Google, all-day, recurring, multi-day, location, and meeting-link events.
3. Confirm denied-permission recovery through iPhone Settings.
4. Export a backup after import, restore it, then repeat import and verify no duplicates appear.
5. Add the post-setup reminder to create a first backup.

## Phase 3 — private TestFlight

- Identity locked on August 20, 2026: Calendream, `com.zachlevet.calendream`, the Calendream C-and-orb icon, and the `calendream` URL scheme.
- Confirm the icon and launch screen on a physical iPhone using a fresh native build.
- Create/confirm the App Store Connect record and Apple agreements.
- Complete privacy labels, support URL, beta description, and tester instructions.
- Run `npm run check`, Expo Doctor, an iOS production export, and an archive build.
- Build with `eas build --platform ios --profile production` and submit the selected build.
- Start with internal testers, then a small external group after Beta App Review.
- Tell every local-only tester to export a backup before installing a new build.
