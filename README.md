# GIF Categories for Vencord

Organize Discord's favorite GIFs by **left-clicking and dragging them onto folder cards**.

- With no categories, the Favorites panel contains only a **+** card.
- Click **+**, name a category, and save. Folder cards appear before the **+** card; unfiled favorites appear underneath.
- Hold the left mouse button on a GIF, drag it onto a folder, and release. The destination highlights while you drag.
- Click a folder to browse its GIFs. Folder cards remain available above the grid so you can drag a GIF into another folder.
- Drop a GIF onto **Unfiled / home** to remove its category assignment.
- Clicking a GIF normally still sends it through Discord's existing picker handler, including GifPaste when enabled.
- **Select to move** is an alternative to dragging: select a GIF with the native picker, then activate a destination folder.
- **Rename** and **Delete** manage the active folder. Deleting a folder returns its GIFs to Unfiled without removing Discord favorites.

Each GIF belongs to one category. New favorites appear in Unfiled. Discord's Favorites search filters the displayed GIFs by URL, as usual. Search and trending results outside Favorites are unchanged.

Categories are saved locally in Vencord's IndexedDB, separately for each Discord account. They survive restarts but do not sync across devices. Discord's original favorite list is never rewritten. Removing a GIF from Discord favorites hides it from its category; favoriting the same URL again restores that assignment. Disabling the plugin restores Discord's standard Favorites view.

## Install

This is a **custom userplugin** for a source build of Vencord. Follow the official [source installation](https://docs.vencord.dev/installing/) and [custom plugin instructions](https://docs.vencord.dev/installing/custom-plugins/).

From your Vencord source directory:

```sh
mkdir -p src/userplugins
git clone https://github.com/Cypphi/vencord-gif-categories.git src/userplugins/gifCategories
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

Restart Discord and enable **GifCategories** under **Settings → Vencord → Plugins**, then restart when prompted. Open the GIF picker and choose Favorites. BetterGifPicker can optionally open Favorites by default.

The plugin has no additional runtime dependencies. It cannot be installed by copying a JavaScript file into a stock Vencord installation. To update, run `git pull` inside `src/userplugins/gifCategories`, rebuild Vencord, and restart Discord.

## Checks

Run the small regression check with Node.js 24 or newer:

```sh
node tests/check.mjs
```

Optionally pass the path to a downloaded Discord `web.*.js` bundle to check both patch matches and the patched JavaScript syntax:

```sh
node tests/check.mjs /path/to/web.bundle.js
```

In the Vencord source checkout, run `pnpm testTsc` and `pnpm build --standalone`.

Validated against Vencord commit `7f0c10cc29fd789f2f4828ae3dc947623e837920` and Discord public web bundle `web.24a0dd4254453b09.js` on October 2, 2026. Checks cover category validation, moves, duplicate drops, deletion, search, storage round-trips, and exact patch matching. Browser checks use an isolated React harness with Discord's current GIF tile and clickable component; no signed-in Discord session was used. Discord updates can require patch adjustments.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
