# Chrome Web Store — Listing & Permission Justifications

Copy-paste ready texts for the Chrome Web Store Developer Dashboard.
UI language of the extension is English; listing texts below are English.

---

## Listing name

**The Last Bookmark Bender**

---

## Short description

Max 132 characters (including spaces). Current draft: **120**.

```
Temporary bookmarks with retention rules, warnings, and a final 24-hour grace period.
```

Alternative (more benefit-focused, **119** chars):

```
Stop link hoarding. Save temporary bookmarks, get warned, then decide in a final 24-hour grace period.
```

---

## Detailed description

```
The Last Bookmark Bender gives every “read later” link an expiration date — so bookmarks don’t live forever by default.

HOW IT WORKS
1. Bend a page — save the current tab into a dedicated lastbookmark folder (toolbar popup, right-click “Bend this page”, or Alt+Shift+B).
2. Get warned — shortly before retention ends, you’ll get a heads-up (optional).
3. Final 24 hours — when time is up, the bookmark enters a grace period. Keep it or delete it.
4. Clean exit — unused bookmarks are removed automatically. Recently deleted items can be restored from the popup.

WHY IT EXISTS
Browser bookmarks are great at collecting and terrible at letting go. This extension adds gentle pressure: temporary by default, with a clear last chance before deletion.

FEATURES
• Default retention you choose (minutes to months)
• Warning before expiration
• Final 24-hour grace period with Keep / Delete
• Toolbar badge for bookmarks that need attention
• Click a notification to reopen the related page
• Search and sort in the popup
• Recently Deleted with restore
• JSON export from Settings
• Keyboard shortcut (Alt+Shift+B — customize in chrome://extensions/shortcuts)

PRIVACY
Everything stays on your device. No accounts, no analytics, no remote sync of your bookmarks. See the Privacy Policy linked on this listing.

LIMITS
• Up to 100 active temporary bookmarks
• Up to 50 recently deleted entries

Made for people who bookmark first and decide later — and want the later part to actually happen.

Open source under the MIT License.
```

---

## Category

Suggested: **Productivity**

---

## Language

**English**

---

## Single purpose (Store questionnaire)

Chrome asks for a single purpose statement. Suggested answer:

```
Provide temporary bookmarks with automatic expiration, warnings, and a final grace period so saved links do not accumulate indefinitely.
```

---

## Permission justifications

Use these in the dashboard wherever Chrome asks why each permission is required.
Keep answers concrete and tied to user-facing features.

### `bookmarks`

```
Required to create and manage temporary bookmarks in a dedicated “lastbookmark” folder, including saving pages, extending retention, and removing bookmarks after expiration or when the user deletes them.
```

### `storage`

```
Required to store settings (retention duration, notification preferences), retention/expiration metadata for each temporary bookmark, and a local Recently Deleted list — all on the user’s device only.
```

### `tabs`

```
Required to read the active tab’s title and URL when the user saves a page from the popup, keyboard shortcut, or context menu, and to open bookmark URLs from notifications.
```

### `activeTab`

```
Required so the extension can access the current tab when the user explicitly invokes it (popup action / save), without requesting broad host access to every website.
```

### `alarms`

```
Required to run periodic checks for approaching expiration, start the final grace period, and delete bookmarks that were not kept after grace ends — even when the popup is closed.
```

### `notifications`

```
Required to notify the user when a bookmark is expiring soon, when the final 24-hour grace period starts (with Keep / Delete actions), and optionally after a bookmark is deleted. Clicking a notification opens the related page.
```

### `contextMenus`

```
Required to add a “Bend this page” item to the page/link context menu so users can save a temporary bookmark without opening the extension popup.
```

---

## Host permission justification

This extension does **not** request host permissions (`http://*/*`, `<all_urls>`, etc.).  
If the dashboard asks: state that only `tabs` / `activeTab` are used for the active page the user chooses to save, and no content scripts are injected into websites.

---

## Remote code / data disclosure notes

Useful for the privacy practices form:

| Question theme | Suggested stance |
|---|---|
| Collects user data remotely? | **No** — local only |
| Sells user data? | **No** |
| Uses data for ads? | **No** |
| Uses analytics / tracking? | **No** |
| Transfers data to third parties? | **No** |
| Handles personally identifiable info? | Only locally as bookmark titles/URLs the user saves; not transmitted |
| Remotely hosted code? | **No** — all logic ships in the extension package |

---

## Privacy policy URL field


`
https://github.com/sevilayerkan/the-last-bookmark-bender/blob/main/PRIVACY.md
`

The in-extension page remains at `privacy/privacy.html` for Settings.
---

## Screenshot captions (optional)

1. `Bend the current page into a temporary bookmark folder.`
2. `See what’s active, expiring soon, or in the final grace period.`
3. `Choose default retention and export your data as JSON.`
4. `Get warned — then keep or delete in the last 24 hours.`
