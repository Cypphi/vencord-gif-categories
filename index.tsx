/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Cypphi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { React, UserStore, useStateFromStores } from "@webpack/common";

import { Category, categoryGifs, matchesQuery, moveGif, readCategories, saveCategory, unfiledGifs } from "./model";

interface Gif {
    url: string;
    src: string;
    gifSrc?: string;
    format?: number;
}

interface Picker {
    state: { resultType: string | null; };
    props: { favorites: Gif[]; query: string; };
}

const DRAG_TYPE = "application/x-vencord-favorite-gif";

type NativeGrid = React.ReactElement<{
    data: Gif[];
    selectedGIF?: Gif;
    onSelectGIF: (gif: Gif, options: { shiftKey: boolean; }) => void;
}>;

function FolderIcon() {
    return <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 7V5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
    </svg>;
}

function Categories({ accountId, favorites, query, original }: {
    accountId: string;
    favorites: Gif[];
    query: string;
    original: NativeGrid;
}) {
    const storageKey = `GifCategories:v1:${accountId}`;
    const [categories, setCategories] = React.useState<Category[] | null>(null);
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState<Category | null>(null);
    const [selecting, setSelecting] = React.useState(false);
    const [selected, setSelected] = React.useState<Gif>();
    const [hovered, setHovered] = React.useState<string | null>(null);
    const [notice, setNotice] = React.useState("");
    const [deleting, setDeleting] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const saving = React.useRef(false);

    React.useEffect(() => {
        let mounted = true;
        DataStore.get(storageKey).then(value => {
            const loaded = readCategories(value);
            if (mounted) setCategories(loaded);
        }).catch(err => { if (mounted) setError(String(err)); });
        return () => { mounted = false; };
    }, [storageKey]);

    async function commit(change: (current: Category[]) => Category[]) {
        if (saving.current || categories === null) return;
        saving.current = true;
        setBusy(true);
        setError("");
        try {
            let saved: Category[] = [];
            await DataStore.update(storageKey, value => {
                saved = change(readCategories(value));
                return saved;
            });
            setCategories(saved);
            setActiveId(deleting ? null : activeId);
            setDraft(null);
            setDeleting(false);
            setSelected(undefined);
            setNotice("Changes saved.");
        } catch (err) {
            setError(String(err));
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }

    const active = categories?.find(c => c.id === activeId);
    const visibleFavorites = favorites.filter(gif => matchesQuery(gif.url, query));
    const visibleGifs = active ? categoryGifs(active, visibleFavorites) : unfiledGifs(categories ?? [], visibleFavorites);

    function move(url: string, targetId: string | null) {
        void commit(current => moveGif(current, url, targetId, favorites));
    }

    function dropProps(targetId: string | null) {
        const key = targetId ?? "unfiled";
        return {
            "data-drop-target": key,
            "data-drag-over": hovered === key,
            onDragOver(event: React.DragEvent) {
                if (busy || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setHovered(key);
            },
            onDragLeave(event: React.DragEvent) {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(null);
            },
            onDrop(event: React.DragEvent) {
                event.preventDefault();
                event.stopPropagation();
                setHovered(null);
                const url = event.dataTransfer.getData(DRAG_TYPE);
                if (url && !busy) move(url, targetId);
            }
        };
    }

    if (categories === null) return <div className="vc-gif-categories">
        {error ? <><p role="alert">{error}</p>{original}</> : <p role="status">Loading categories…</p>}
    </div>;

    return <section className="vc-gif-categories" aria-label="Favorite GIF categories">
        {error && <p role="alert" className="vc-gif-categories-error">{error}</p>}
        {draft ? <form className="vc-gif-categories-editor" onSubmit={event => {
            event.preventDefault();
            void commit(current => saveCategory(current, draft));
        }}>
            <fieldset disabled={busy}>
                <label className="vc-gif-categories-name">
                    Category name
                    <input value={draft.name} maxLength={60} required placeholder="e.g. Reactions"
                        onChange={event => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <div className="vc-gif-categories-toolbar">
                    <button type="submit">Save category</button>
                    <button type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
                </div>
            </fieldset>
        </form> : <>
            {categories.length > 0 && <div className="vc-gif-categories-toolbar">
                <button type="button" {...dropProps(null)} disabled={busy} onClick={() => {
                    if (selected) move(selected.url, null);
                    else { setActiveId(null); setDeleting(false); }
                }}>Unfiled / home</button>
                <button type="button" disabled={busy} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected(undefined); }}>
                    {selecting ? "Cancel selection" : "Select to move"}
                </button>
            </div>}
            <div className="vc-gif-categories-grid vc-gif-categories-folders">
                {categories.map(category =>
                    <button type="button" className="vc-gif-categories-card" key={category.id}
                        {...dropProps(category.id)} aria-pressed={activeId === category.id} disabled={busy}
                        onClick={() => {
                            if (selected) move(selected.url, category.id);
                            else { setActiveId(category.id); setDeleting(false); setError(""); }
                        }}>
                        <FolderIcon />
                        <strong>{category.name}</strong>
                        <span>{categoryGifs(category, favorites).length} GIFs</span>
                    </button>
                )}
                <button type="button" className="vc-gif-categories-card vc-gif-categories-add" aria-label="Create GIF category"
                    disabled={busy} onClick={() => { setSelected(undefined); setDraft({ id: crypto.randomUUID(), name: "", urls: [] }); }}>
                    <span aria-hidden="true">+</span>
                </button>
            </div>
            {categories.length > 0 && <>
                <div className="vc-gif-categories-toolbar">
                    <strong className="vc-gif-categories-title">{active?.name ?? "Unfiled favorites"}</strong>
                    {active && <>
                        <button type="button" disabled={busy} onClick={() => setDraft({ ...active, urls: [...active.urls] })}>Rename</button>
                        <button type="button" disabled={busy} onClick={() => setDeleting(true)}>Delete</button>
                    </>}
                </div>
                <p role="status">{selected ? "Choose a folder above, or Unfiled / home." : selecting ? "Select a GIF, then choose its folder." : notice || "Drag a GIF onto a folder above to move it. Click a GIF to send it."}</p>
                {deleting && active && <div className="vc-gif-categories-confirm" role="group" aria-label="Confirm category deletion">
                    <p>Delete “{active.name}”? Its GIFs return to Unfiled. Your Discord favorites will be kept.</p>
                    <button type="button" disabled={busy} onClick={() => void commit(current => current.filter(c => c.id !== active.id))}>Delete category</button>
                    <button type="button" disabled={busy} onClick={() => setDeleting(false)}>Cancel</button>
                </div>}
                {visibleGifs.length
                    ? <div className="vc-gif-categories-native">{React.cloneElement(original, {
                        key: active?.id ?? "unfiled",
                        data: visibleGifs,
                        selectedGIF: selected,
                        onSelectGIF: selecting ? gif => setSelected(gif) : original.props.onSelectGIF
                    })}</div>
                    : <p>{query ? "No GIFs match your search." : active ? "Drag GIFs here from Unfiled or another folder." : "All favorites are organized. New favorites will appear here."}</p>}
            </>}
        </>}
    </section>;
}

function CategoryPanel({ picker, original }: { picker: Picker; original: NativeGrid; }) {
    const accountId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    if (!accountId) return original;
    return <ErrorBoundary key={accountId} fallback={() => original}>
        <Categories key={accountId} accountId={accountId} favorites={picker.props.favorites}
            query={picker.props.query ?? ""} original={original} />
    </ErrorBoundary>;
}

export default definePlugin({
    name: "GifCategories",
    description: "Organize your favorite GIFs into category folders inside the GIF picker.",
    authors: [{ name: "Cypphi", id: 0n }],
    tags: ["Media", "Organisation"],
    patches: [{
        find: "renderHeaderContent(){",
        replacement: {
            match: /children:this\.renderContent\(\)/,
            replace: "children:$self.renderCategories(this,this.renderContent())"
        }
    }, {
        find: "renderGIF(){",
        replacement: {
            match: /onClick:this\.handleClick,onContextMenu:this\.handleContextMenu/,
            replace: "$&,draggable:true,onDragStart:e=>$self.startDrag(e,this.props.item)"
        }
    }],
    startDrag(event: React.DragEvent, gif: Gif) {
        if (!gif?.url || !event.currentTarget.closest(".vc-gif-categories")) return;
        event.dataTransfer.setData(DRAG_TYPE, gif.url);
        event.dataTransfer.effectAllowed = "move";
    },
    renderCategories(picker: Picker, original: NativeGrid) {
        if (picker.state.resultType !== "Favorites") return original;
        return <CategoryPanel picker={picker} original={original} />;
    }
});
