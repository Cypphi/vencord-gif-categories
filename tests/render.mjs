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
const original = React.createElement("native-grid", { data: favorites, onSelectGIF() {} });
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
    const plus = nodes.findIndex(node => node.props["aria-label"] === "Create GIF category");
    const grid = nodes.findIndex(node => node.type === "native-grid");
    assert.ok(plus >= 0 && grid > plus, "GIF grid must render after the folder creation card, even with no folders");
    assert.deepEqual(nodes[grid].props.data, categories.length ? [favorites[1]] : favorites);
}
assert.equal(plugin.renderCategories({ state: { resultType: "Search" } }, original), original);
console.log("Rendering checks passed: fresh install, existing folder, last folder deleted, card order, native search unchanged.");
