# aohm — Expo meditation app

This is an update for your existing Expo project, not a complete standalone project.

## Apply
1. Back up your existing `App.js` and `app.json`.
2. Replace `App.js` with the supplied file. Keep `assets/sounds` in place.
3. In your existing `app.json`, change `expo.name` to `aohm` and `expo.slug` to `aohm`. Keep your other configuration fields unchanged.
4. If your existing project has a bundle identifier or Android package name, do not change those identifiers without planning a migration.
5. Install haptics: `npx expo install expo-haptics`
6. Run: `npx expo start --clear` (or `npx expo start --web`).

The app displays `aohm`. New storage keys are `omm-prefs` and `omm-sessions`, and the code reads older saved data so your history and preferences can carry over. The haptics feature and the existing breathing/audio/session UI remain.

Note: the old storage keys remain referenced in code solely for backwards-compatible migration. Do not delete them until after migration is confirmed.

Browser/device testing has not been performed.
