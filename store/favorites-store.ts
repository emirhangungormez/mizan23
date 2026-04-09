"use client";

import { create } from "zustand";

export type FavoriteMarket = "bist" | "us" | "crypto" | "commodities" | "funds" | "fx";

export interface FavoriteListItem {
  symbol: string;
  name?: string;
  market: FavoriteMarket;
  addedAt: string;
}

export interface FavoriteList {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: FavoriteListItem[];
}

interface FavoriteState {
  lists: FavoriteList[];
  isLoading: boolean;
  initializedForUserId: string | null;
  initialize: (userId: string | null) => Promise<void>;
  refreshLists: (userId: string | null) => Promise<void>;
  createList: (userId: string, name: string) => Promise<string | null>;
  deleteList: (listId: string, userId?: string | null) => Promise<void>;
  addItemToList: (listId: string, item: Omit<FavoriteListItem, "addedAt">, userId?: string | null) => Promise<void>;
  removeItemFromList: (listId: string, symbol: string, userId?: string | null) => Promise<void>;
  toggleItemInList: (
    listId: string,
    item: Omit<FavoriteListItem, "addedAt">,
    userId?: string | null
  ) => Promise<boolean>;
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

async function fetchFavoriteLists(userId: string | null): Promise<FavoriteList[]> {
  if (!userId) return [];
  const response = await fetch(`/api/favorites?userId=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Favori listeleri yuklenemedi.");
  }
  return response.json();
}

export const useFavoritesStore = create<FavoriteState>()((set, get) => ({
  lists: [],
  isLoading: false,
  initializedForUserId: null,

  initialize: async (userId) => {
    if (!userId) {
      set({ lists: [], initializedForUserId: null, isLoading: false });
      return;
    }
    if (get().initializedForUserId === userId && !get().isLoading) {
      return;
    }
    await get().refreshLists(userId);
  },

  refreshLists: async (userId) => {
    if (!userId) {
      set({ lists: [], initializedForUserId: null, isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const lists = await fetchFavoriteLists(userId);
      set({ lists, initializedForUserId: userId, isLoading: false });
    } catch {
      set({ lists: [], initializedForUserId: userId, isLoading: false });
    }
  },

  createList: async (userId, name) => {
    const normalizedName = normalizeName(name);
    if (!normalizedName) return null;

    const response = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "create", userId, name: normalizedName }),
    });
    if (!response.ok) return null;

    const created = (await response.json()) as FavoriteList;
    await get().refreshLists(userId);
    return created.id;
  },

  deleteList: async (listId, userId) => {
    await fetch(`/api/favorites?id=${encodeURIComponent(listId)}`, { method: "DELETE" });
    await get().refreshLists(userId || get().initializedForUserId);
  },

  addItemToList: async (listId, item, userId) => {
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "toggle", listId, ...item }),
    });
    await get().refreshLists(userId || get().initializedForUserId);
  },

  removeItemFromList: async (listId, symbol, userId) => {
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "remove-item", listId, symbol }),
    });
    await get().refreshLists(userId || get().initializedForUserId);
  },

  toggleItemInList: async (listId, item, userId) => {
    const response = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "toggle", listId, ...item }),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { added: boolean };
    await get().refreshLists(userId || get().initializedForUserId);
    return payload.added;
  },
}));
