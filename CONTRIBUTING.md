# Contributing

This is a small, personally maintained project. **Bug reports and feature ideas are welcome. Unsolicited pull requests are not.**

If you want to contribute code, please [email first](mailto:notdepressedeveloper@gmail.com) before opening a PR.

## Issues

Use a GitHub issue template when you can:

- **Bug Report** — something is broken or unexpected
- **Feature Request** — a change or addition you’d like to see

Search existing issues first to avoid duplicates.

## Running it locally

Useful if you want to try a change on your own machine (forks are fine under MIT):

1. Clone the repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select the repository folder
5. After code changes, click **Reload** on the extension card (and reopen the popup if it was open)

There is no build step. The extension loads as unpacked Manifest V3 source.

## Tests

Retention, duplicate/limit, recently deleted, and restore logic run under Node's built-in test runner (Node 18+, no install):

```
npm test
```

or `node --test tests/retention.test.js tests/deleted.test.js tests/bookmarks.test.js`

These files are not loaded by Chrome. Keep `GRACE_PERIOD_MINUTES` / `CHECK_INTERVAL_MINUTES` as they are for manual extension testing.

## Project layout

- `background/service-worker.js` — alarms, notifications, expiration / grace / deletion
- `shared/` — bookmarks, retention, storage, recently deleted, constants
- `popup/`, `settings/`, `onboarding/`, `privacy/` — UI pages
- `store/listing.md` — Chrome Web Store copy (not shipped in the extension)
- `tests/` — unit tests for `shared/` (not loaded by the extension)

## License

The project is licensed under the [MIT License](LICENSE).
