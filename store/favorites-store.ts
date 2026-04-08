import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  createList: (userId: string, name: string) => string | null;
  deleteList: (listId: string) => void;
  addItemToList: (listId: string, item: Omit<FavoriteListItem, "addedAt">) => void;
  removeItemFromList: (listId: string, symbol: string) => void;
  toggleItemInList: (listId: string, item: Omit<FavoriteListItem, "addedAt">) => boolean;
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export const useFavoritesStore = create<FavoriteState>()(
  persist(
    (set, get) => ({
      lists: [],

      createList: (userId, name) => {
        const normalizedName = normalizeName(name);
        if (!normalizedName) return null;

        const existing = get().lists.find(
          (list) =>
            list.userId === userId &&
            list.name.trim().toLocaleLowerCase("tr-TR") === normalizedName.toLocaleLowerCase("tr-TR")
        );
        if (existing) return existing.id;

        const now = new Date().toISOString();
        const id = `fav_${Date.now()}`;
        const nextList: FavoriteList = {
          id,
          userId,
          name: normalizedName,
          createdAt: now,
          updatedAt: now,
          items: [],
        };

        set((state) => ({ lists: [...state.lists, nextList] }));
        return id;
      },

      deleteList: (listId) => {
        set((state) => ({ lists: state.lists.filter((list) => list.id !== listId) }));
      },

      addItemToList: (listId, item) => {
        set((state) => ({
          lists: state.lists.map((list) => {
            if (list.id !== listId) return list;

            const exists = list.items.some((entry) => entry.symbol === item.symbol);
            if (exists) return list;

            return {
              ...list,
              updatedAt: new Date().toISOString(),
              items: [
                ...list.items,
                {
                  ...item,
                  addedAt: new Date().toISOString(),
                },
              ],
            };
          }),
        }));
      },

      removeItemFromList: (listId, symbol) => {
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id !== listId
              ? list
              : {
                  ...list,
                  updatedAt: new Date().toISOString(),
                  items: list.items.filter((entry) => entry.symbol !== symbol),
                }
          ),
        }));
      },

      toggleItemInList: (listId, item) => {
        const targetList = get().lists.find((list) => list.id === listId);
        if (!targetList) return false;

        const exists = targetList.items.some((entry) => entry.symbol === item.symbol);
        if (exists) {
          get().removeItemFromList(listId, item.symbol);
          return false;
        }

        get().addItemToList(listId, item);
        return true;
      },
    }),
    {
      name: "mizan23-favorites",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lists: state.lists }),
    }
  )
);
