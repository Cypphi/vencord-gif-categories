/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Cypphi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Category {
    id: string;
    name: string;
    urls: string[];
}

export function readCategories(value: unknown): Category[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(c =>
        !c || typeof c.id !== "string" || !c.id || typeof c.name !== "string" || !c.name.trim()
        || !Array.isArray(c.urls) || c.urls.some((url: unknown) => typeof url !== "string")
    ) || new Set(value.map(c => c.id)).size !== value.length)
        throw new Error("Saved GIF categories could not be read. Your data has not been overwritten.");
    return value;
}

export function saveCategory(categories: Category[], category: Category): Category[] {
    const name = category.name.trim();
    if (!name || name.length > 60) throw new Error("Use a category name between 1 and 60 characters.");
    if (categories.some(c => c.id !== category.id && c.name.toLowerCase() === name.toLowerCase()))
        throw new Error("A category with that name already exists.");
    const saved = { ...category, name, urls: [...new Set(category.urls)] };
    return categories.some(c => c.id === saved.id)
        ? categories.map(c => c.id === saved.id ? saved : c)
        : [...categories, saved];
}

export function categoryGifs<T extends { url: string; }>(category: Category, favorites: T[]): T[] {
    const urls = new Set(category.urls);
    return favorites.filter(gif => urls.has(gif.url));
}

export function matchesQuery(value: string, query: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]/g, "");
    return normalize(value).includes(normalize(query));
}

export function moveGif(categories: Category[], url: string, targetId: string | null, favorites: { url: string; }[]): Category[] {
    if (!favorites.some(gif => gif.url === url)) throw new Error("Only your favorite GIFs can be moved.");
    if (targetId !== null && !categories.some(c => c.id === targetId)) throw new Error("That category no longer exists.");
    return categories.map(c => ({
        ...c,
        urls: c.id === targetId ? [...new Set([...c.urls, url])] : c.urls.filter(item => item !== url)
    }));
}

export function unsortedGifs<T extends { url: string; }>(categories: Category[], favorites: T[]): T[] {
    const filed = new Set(categories.flatMap(c => c.urls));
    return favorites.filter(gif => !filed.has(gif.url));
}
