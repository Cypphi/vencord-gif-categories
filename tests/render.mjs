import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

// Uses Vencord's existing esbuild; no test framework or extra dependency.
assert.ok(process.argv[2], "Usage: node tests/render.mjs /path/to/Vencord");
const { build } = createRequire(resolve(process.argv[2], "package.json"))("esbuild");
const favorites = [{ url: "https://example.com/cat.gif" }, { url: "https://example.com/wave.gif" }];
let storedCategories = [];
let current;
const instances = new Map();
const React = {
    Fragment: Symbol("Fragment"),
    createElement(type, props, ...children) {
        return { type, props: { ...props, ...(children.length ? { children } : {}) } };
    },
    cloneElement(element, props) { return { ...element, props: { ...element.props, ...props } }; },
    useState(initial) {
        const instance = current;
        const index = instance.index++;
        if (!(index in instance.values)) instance.values[index] = initial;
        return [instance.values[index], value => { instance.values[index] = value; }];
    },
    useRef(value) { return this.useState({ current: value })[0]; },
    useEffect(effect) {
        const index = current.index++;
        if (!(index in current.values)) { current.values[index] = true; effect(); }
    }
};
const mocks = {
    common: { React, UserStore: { getCurrentUser: () => ({ id: "test-account" }) }, useStateFromStores: (_, getter) => getter() },
    store: { get: async () => structuredClone(storedCategories) },
    boundary: ({ children }) => children,
    define: value => value
};
const result = await build({
    entryPoints: [fileURLToPath(new URL("../index.tsx", import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment", loader: { ".css": "empty" },
    plugins: [{ name: "test-host", setup(build) {
        build.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: "test-host" }));
        build.onLoad({ filter: /.*/, namespace: "test-host" }, args => ({ contents: {
            "@webpack/common": "module.exports = mocks.common;",
            "@api/DataStore": "module.exports = mocks.store;",
            "@components/ErrorBoundary": "module.exports = mocks.boundary;",
            "@utils/types": "module.exports = mocks.define;"
        }[args.path] }));
    } }]
});
const context = { module: { exports: {} }, mocks };
runInNewContext(result.outputFiles[0].text, context);
const plugin = context.module.exports.default;
function expand(node) {
    if (Array.isArray(node)) return node.flatMap(expand);
    if (!node || typeof node !== "object") return [];
    if (typeof node.type === "function") {
        if (!instances.has(node.type)) instances.set(node.type, { index: 0, values: [] });
        current = instances.get(node.type);
        current.index = 0;
        return expand(node.type(node.props));
    }
    return [node, ...expand(node.props.children)];
}
let sent = 0;
const original = React.createElement("native-grid", { data: favorites, onSelectGIF() { sent++; } });
async function render(categories) {
    storedCategories = categories;
    instances.clear();
    const panel = plugin.renderCategories({ state: { resultType: "Favorites" }, props: { favorites, query: "" } }, original);
    expand(panel); // Mount, then allow the local category store to finish loading.
    await Promise.resolve();
    return expand(panel);
}
for (const categories of [[], [{ id: "cats", name: "Cats", urls: [favorites[0].url] }], []]) {
    const nodes = await render(categories);
    const grids = nodes.filter(node => node.type === "native-grid");
    assert.equal(grids.length, 1, "Cards and GIFs must use a single native grid");
    const { data, onSelectGIF } = grids[0].props;
    const cardCount = categories.length + 1;
    assert.ok(data.slice(0, cardCount).every(item => "categoryCard" in item));
    assert.equal(data[cardCount - 1].id, "gif-category:create");
    assert.deepEqual(Array.from(data.slice(cardCount)), categories.length ? [favorites[1]] : favorites);
    const plus = expand(plugin.renderCard(data[cardCount - 1], {}, "create"));
    assert.ok(plus.some(node => node.props["aria-label"] === "Create GIF category"));
    assert.equal(nodes.filter(node => node.type === "button").length, 0, "No extra toolbar outside the grid");
    if (categories.length) {
        onSelectGIF(data[0], { shiftKey: false });
        assert.equal(sent, 0, "Opening a folder must not send a GIF");
    }

}
// Discord's global HTML5 drag backend rejects unregistered drop targets.
// Our own drag events must stop before reaching that handler.
const transfer = new Map([["text/uri-list", favorites[0].url]]);
function event() {
    return {
        stopped: false, prevented: false,
        currentTarget: { closest: () => true, dataset: {}, contains: () => false },
        relatedTarget: null,
        stopPropagation() { this.stopped = true; },
        preventDefault() { this.prevented = true; },
        dataTransfer: {
            get types() { return [...transfer.keys()]; },
            clearData() { transfer.clear(); },
            setData(type, value) { transfer.set(type, value); },
            getData(type) { return transfer.get(type) ?? ""; }
        }
    };
}
const start = event();
plugin.startDrag(start, favorites[0]);
assert.ok(start.stopped, "Custom dragstart must not reach Discord's backend");
assert.equal(start.dataTransfer.effectAllowed, "move");
assert.deepEqual([...transfer.values()], [favorites[0].url]);
assert.equal(transfer.has("text/uri-list"), false, "Native image payload must not trigger Discord's upload handling");
const dragNodes = await render([{ id: "cats", name: "Cats", urls: [] }]);
const folderCard = dragNodes.find(node => node.type === "native-grid").props.data[0];
const folderButton = expand(plugin.renderCard(folderCard, {}, "folder")).find(node => node.type === "button");
for (const handler of ["onDragEnter", "onDragOver", "onDragLeave"]) {
    const drag = event();
    folderButton.props[handler](drag);
    // Same unregistered-target behavior as Discord's handleTopDragOver.
    if (!drag.stopped) drag.dataTransfer.dropEffect = "none";
    assert.ok(drag.stopped, `${handler} must be isolated from Discord's drag backend`);
    if (handler !== "onDragLeave") {
        assert.ok(drag.prevented);
        assert.equal(drag.dataTransfer.dropEffect, "move");
    }
}
transfer.clear();
transfer.set("text/plain", "unrelated drag");
const unrelated = event();
folderButton.props.onDragOver(unrelated);
assert.equal(unrelated.stopped, false, "Unrelated drags must remain untouched");
assert.equal(plugin.renderCategories({ state: { resultType: "Search" } }, original), original);
console.log("Rendering checks passed: fresh install, existing folder, last folder deleted, one native grid, card order, no toolbars, native search unchanged, Discord drag-event isolation.");
