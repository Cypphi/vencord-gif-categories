import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { categoryGifs, matchesQuery, moveGif, readCategories, saveCategory, unsortedGifs } from "../model.ts";

const favorites = [{ url: "https://example.com/happy-cat.gif" }, { url: "https://example.com/wave.gif" }];
let categories = readCategories(undefined);
assert.deepEqual(categories, []);
assert.throws(() => readCategories({}), /not been overwritten/);
assert.throws(() => readCategories([{ id: "a", name: "a", urls: [1] }]));
categories = saveCategory(categories, { id: "a", name: " Reactions ", urls: [] });
categories = saveCategory(categories, { id: "b", name: "Cats", urls: [] });
assert.equal(categories[0].name, "Reactions");
assert.throws(() => saveCategory(categories, { id: "c", name: "reactions", urls: [] }), /already exists/);
assert.throws(() => saveCategory(categories, { id: "c", name: "  ", urls: [] }));
const before = structuredClone(categories);
categories = moveGif(categories, favorites[0].url, "a", favorites);
assert.deepEqual(before[0].urls, [], "moving must not mutate old state");
assert.deepEqual(categoryGifs(categories[0], favorites), [favorites[0]]);
assert.deepEqual(unsortedGifs(categories, favorites), [favorites[1]]);
categories = moveGif(categories, favorites[0].url, "b", favorites);
assert.deepEqual(categories[0].urls, [], "move removes the old membership");
assert.deepEqual(categories[1].urls, [favorites[0].url]);
categories = moveGif(categories, favorites[0].url, "b", favorites);
assert.equal(categories[1].urls.length, 1, "repeated drop must not duplicate a GIF");
assert.throws(() => moveGif(categories, "https://external.invalid/gif", "a", favorites));
assert.throws(() => moveGif(categories, favorites[0].url, "missing", favorites));
assert.deepEqual(categoryGifs(categories[1], []), [], "unfavorited GIFs must not be shown");
assert.deepEqual(unsortedGifs(categories.filter(c => c.id !== "b"), favorites), favorites, "deleting a folder returns GIFs to Unsorted");
categories = moveGif(categories, favorites[0].url, null, favorites);
assert.deepEqual(unsortedGifs(categories, favorites), favorites);
assert.ok(matchesQuery(favorites[0].url, "HAPPY cat"));
assert.deepEqual(readCategories(JSON.parse(JSON.stringify(categories))), categories);
assert.deepEqual(favorites, [{ url: "https://example.com/happy-cat.gif" }, { url: "https://example.com/wave.gif" }]);
console.log("Category checks passed: validation, moves, duplicates, removal, deletion, search, persistence.");

// Optional: verify the actual patch patterns and resulting syntax against a public Discord web bundle.
if (process.argv[2]) {
    const bundle = readFileSync(process.argv[2], "utf8");
    const source = readFileSync(new URL("../index.tsx", import.meta.url), "utf8");
    const patches = [...source.matchAll(/find: "([^"]+)",[\s\S]*?match: (\/[^\n]+\/),\s*replace: ("[^\n]+")/g)];
    assert.equal(patches.length, 4);
    const starts = [...bundle.matchAll(/(?:\{|,)(\d+)\(e,t,n\)\{/g)];
    for (const [, find, literal, replacement] of patches) {
        const at = bundle.indexOf(find);
        assert.ok(at >= 0, `Missing module anchor: ${find}`);
        const i = starts.findLastIndex(m => m.index < at);
        const module = bundle.slice(starts[i].index + 1, starts[i + 1].index);
        const pattern = new RegExp(literal.slice(1, -1));
        assert.equal([...module.matchAll(new RegExp(pattern.source, "g"))].length, 1, `Ambiguous patch: ${find}`);
        const patched = module.replace(pattern, JSON.parse(replacement));
        assert.notEqual(patched, module);
        new Script(`({${patched}})`);
    }
    console.log("All patches match the supplied Discord bundle exactly once and produce valid JavaScript.");
}
