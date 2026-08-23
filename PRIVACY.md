# Privacy Policy — The Last Bookmark Bender

**Last updated:** August 23, 2026

## Summary

The Last Bookmark Bender runs entirely on your device. It does not send your bookmarks, browsing history, or settings to any remote server. There is no account system and no analytics.

## Data we store locally

The extension stores the following in Chrome’s local extension storage on your computer:

- Your settings (default retention duration and notification preferences)
- Metadata for temporary bookmarks (title, URL, created time, expiration / grace timestamps)
- A short “Recently Deleted” list (title, URL, deletion time), capped in size
- The ID of the extension’s bookmark folder

Bookmarks themselves are created and removed through Chrome’s Bookmarks API and appear in your normal Chrome bookmark tree (in the **lastbookmark** folder).

## Permissions

- **bookmarks** — create, read, move, and remove temporary bookmarks in the dedicated folder
- **storage** — save settings and retention metadata locally
- **tabs / activeTab** — read the active tab’s title and URL when you save it, and open bookmark URLs from notifications
- **alarms** — periodically check expiration and grace periods
- **notifications** — warn before expiration, during the final grace period, and after deletion (if enabled)
- **contextMenus** — offer “Bend this page” on the page/link context menu

## What we do not do

- We do not collect personal information on a server
- We do not sell or share data with third parties
- We do not use advertising trackers or analytics SDKs
- We do not access page content beyond what you explicitly save (title and URL)

## Data retention and deletion

Temporary bookmarks are removed automatically after their retention period and final grace period, unless you keep or extend them. Manually deleted items may remain in Recently Deleted until you restore or permanently remove them, or until the list reaches its size limit and older entries drop off.

Uninstalling the extension removes its local storage. Bookmark folder contents already in Chrome may remain until you delete them yourself.

## Children

This extension is not directed at children under 13, and we do not knowingly collect data from them.

## Changes

If this policy changes, the “Last updated” date above will be revised. Material changes will be reflected in the extension listing or release notes when published to the Chrome Web Store.

## Contact

Questions about privacy: contact the publisher listed on the Chrome Web Store listing, or email [notdepressedeveloper@gmail.com](mailto:notdepressedeveloper@gmail.com).
