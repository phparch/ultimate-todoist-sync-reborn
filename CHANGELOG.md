## CHANGELOG

### [1.1.0] - 2026-02-25

- **Breaking: Todoist API migration**
    - Upgraded from the deprecated Todoist REST API v2 / Sync API v9 to the new Todoist API v1.
    - Todoist shut down the legacy APIs on February 10, 2026, which broke the plugin entirely. This update restores full functionality.
- Dependencies
    - `@doist/todoist-api-typescript` upgraded from v2.1.2 to v6.5.0
    - TypeScript upgraded from 4.7.4 to 5.4
    - `@types/node` upgraded from v16 to v20
- Internal improvements
    - Custom fetch adapter using Obsidian's `requestUrl` for CORS-free API access
    - Cursor-based pagination support for projects and tasks
    - All source code comments translated from Chinese to English

### prelease [1.0.38] - 2023-06-09

https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian/releases/tag/v1.0.38-beta

- New feature
    - 1.0.38 beta now supports date formats for tasks.
    - Todoist task link is added.

### prelease [1.0.37] - 2023-06-05

https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian/releases/tag/v1.0.37-beta

- New feature
    - Two-way automatic synchronization, no longer need to manually click the sync button.
    - Full vault sync option, automatically adding `#todoist` to all tasks.
    - Notes/comments one-way synchronization from Todoist to Obsidian.
- Bug fix
    - Fixed the bug of time zone conversion.
    - Removed the "#" from the Todoist label.
    - Update the obsidian link in Todoist after moving or renaming a file.
