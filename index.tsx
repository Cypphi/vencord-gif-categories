/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Cypphi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { ConfirmModal, ContextMenuApi, Menu, openModal, React, UserStore, useStateFromStores } from "@webpack/common";

import { Category, categoryGifs, matchesQuery, moveGif, readCategories, saveCategory, unsortedGifs } from "./model";

interface Gif {
    url: string;
    src: string;
}

interface Card extends Gif {
    id: string;
    width: number;
    height: number;
    categoryCard: React.ReactNode;
    select(): void;
}

interface Picker {
    state: { resultType: string | null; };
    props: { favorites: Gif[]; query: string; };
}

const DRAG_TYPE = "application/x-vencord-favorite-gif";

type NativeGrid = React.ReactElement<{
    data: (Gif | Card)[];
    onSelectGIF: (gif: Gif, options: { shiftKey: boolean; }) => void;
    onGifCategoryMenu?: (event: React.MouseEvent, gif: Gif) => void;
}>;

function FolderIcon() {
    return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
            setDraft(null);
            if (!saved.some(c => c.id === activeId)) setActiveId(null);
        } catch (err) {
            setError(String(err));
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }

    function move(url: string, targetId: string | null) {
        void commit(current => moveGif(current, url, targetId, favorites));
    }

    function dropProps(targetId: string | null) {
        return {
            "data-drop-target": targetId ?? "unsorted",
            onDragOver(event: React.DragEvent<HTMLButtonElement>) {
                if (busy || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                event.currentTarget.dataset.dragOver = "true";
            },
            onDragLeave(event: React.DragEvent<HTMLButtonElement>) {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) delete event.currentTarget.dataset.dragOver;
            },
            onDrop(event: React.DragEvent<HTMLButtonElement>) {
                event.preventDefault();
                event.stopPropagation();
                delete event.currentTarget.dataset.dragOver;
                const url = event.dataTransfer.getData(DRAG_TYPE);
                if (url && !busy) move(url, targetId);
            }
        };
    }

    function folderMenu(event: React.MouseEvent, category: Category) {
        ContextMenuApi.openContextMenu(event, () => <Menu.Menu navId="gif-category" onClose={ContextMenuApi.closeContextMenu} aria-label="Category options">
            <Menu.MenuItem id="rename" label="Rename" action={() => setDraft({ ...category })} />
            <Menu.MenuItem id="delete" label="Delete" color="danger" action={() => openModal(props => <ConfirmModal
                {...props} title={`Delete “${category.name}”?`} subtitle="Its GIFs will return to Unsorted. Your Discord favorites will be kept."
                confirmText="Delete" cancelText="Cancel" onConfirm={() => commit(current => current.filter(c => c.id !== category.id))}
            />)} />
        </Menu.Menu>);
    }

    function gifMenu(event: React.MouseEvent, gif: Gif) {
        ContextMenuApi.openContextMenu(event, () => <Menu.Menu navId="gif-category-move" onClose={ContextMenuApi.closeContextMenu} aria-label="Move GIF">
            <Menu.MenuItem id="unsorted" label="Move to Unsorted" disabled={busy} action={() => move(gif.url, null)} />
            {categories?.map(c => <Menu.MenuItem key={c.id} id={c.id} label={`Move to ${c.name}`} disabled={busy} action={() => move(gif.url, c.id)} />)}
        </Menu.Menu>);
    }

    const active = categories?.find(c => c.id === activeId);
    const visibleFavorites = favorites.filter(gif => matchesQuery(gif.url, query));
    const gifs = active ? categoryGifs(active, visibleFavorites) : unsortedGifs(categories ?? [], visibleFavorites);
    const cards: Card[] = [];
    function addCard(id: string, content: React.ReactNode, select: () => void) {
        cards.push({ id: `gif-category:${id}`, url: "", src: "", width: 200, height: 125, categoryCard: content, select });
    }

    if (active) addCard("back", <button type="button" className="vc-gif-category-card" {...dropProps(null)} disabled={busy} onClick={() => setActiveId(null)}>← Unsorted</button>, () => setActiveId(null));
    for (const category of categories ?? []) {
        const select = () => { setActiveId(category.id); setError(""); };
        addCard(category.id, <button type="button" className="vc-gif-category-card" {...dropProps(category.id)}
            disabled={busy} aria-pressed={activeId === category.id} onClick={select} onContextMenu={event => folderMenu(event, category)}>
            <FolderIcon /><span>{category.name}</span>
        </button>, select);
    }
    const create = () => setDraft({ id: crypto.randomUUID(), name: "", urls: [] });
    addCard("create", <button type="button" className="vc-gif-category-card vc-gif-category-add" disabled={busy}
        aria-label="Create GIF category" onClick={create}>+</button>, create);

    return <section className="vc-gif-categories" aria-label="Favorite GIF categories">
        {error && <p role="alert" className="vc-gif-categories-error">{error}</p>}
        {draft ? <form className="vc-gif-category-editor" onSubmit={event => { event.preventDefault(); void commit(current => saveCategory(current, draft)); }}>
            <fieldset disabled={busy}>
                <label>Category name<input value={draft.name} maxLength={60} required placeholder="e.g. Reactions" onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
                <button type="submit">Save</button>
                <button type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
            </fieldset>
        </form> : categories === null ? original : React.cloneElement(original, {
            key: active?.id ?? "unsorted",
            data: [...cards, ...gifs],
            onGifCategoryMenu: gifMenu,
            onSelectGIF: (gif, options) => "categoryCard" in gif ? (gif as Card).select() : original.props.onSelectGIF(gif, options)
        })}
    </section>;
}

function CategoryPanel({ picker, original }: { picker: Picker; original: NativeGrid; }) {
    const accountId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    if (!accountId) return original;
    return <ErrorBoundary key={accountId} fallback={() => original}>
        <Categories key={accountId} accountId={accountId} favorites={picker.props.favorites} query={picker.props.query ?? ""} original={original} />
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
    }, {
        find: "renderEmptyFavorites(){",
        replacement: {
            match: /renderItem=\(([\w$]+),([\w$]+),([\w$]+),([\w$]+)\)=>\{/,
            replace: "$&if($1===0&&this.props.data[$2]?.categoryCard)return $self.renderCard(this.props.data[$2],$3,$4);"
        }
    }, {
        find: "renderEmptyFavorite(",
        replacement: {
            match: /handleContextMenu=\(([\w$]+),([\w$]+)\)=>\{/,
            replace: "$&if(this.props.onGifCategoryMenu)return this.props.onGifCategoryMenu($1,$2);"
        }
    }],
    renderCard(card: Card, style: React.CSSProperties, key: React.Key) {
        return <div key={key} style={style} className="vc-gif-category-cell">{card.categoryCard}</div>;
    },
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
