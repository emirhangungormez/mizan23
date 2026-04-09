"use client";

import { create } from "zustand";

export interface User {
  id: string;
  name: string;
  avatar?: string;
  role: "admin" | "user" | "guest";
  preferences: {
    theme: "light" | "dark" | "system";
  };
  createdAt?: string;
  updatedAt?: string;
}

interface UserState {
  users: User[];
  currentUser: User | null;
  hasHydrated: boolean;
  isLoading: boolean;
  initialize: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  selectUser: (userId: string) => void;
  logout: () => void;
  addUser: (name: string) => Promise<User | null>;
  removeUser: (userId: string) => Promise<boolean>;
  setHasHydrated: (value: boolean) => void;
}

const STORAGE_KEY = "mizan23-current-user-id";

function readStoredUserId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function writeStoredUserId(userId: string | null) {
  if (typeof window === "undefined") return;
  if (userId) {
    window.localStorage.setItem(STORAGE_KEY, userId);
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

async function fetchUsersFromApi(): Promise<User[]> {
  const response = await fetch("/api/users", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Kullanici profilleri yuklenemedi.");
  }
  return response.json();
}

export const useUserStore = create<UserState>()((set, get) => ({
  users: [],
  currentUser: null,
  hasHydrated: false,
  isLoading: false,

  setHasHydrated: (value) => set({ hasHydrated: value }),

  initialize: async () => {
    if (get().hasHydrated || get().isLoading) {
      return;
    }

    set({ isLoading: true });
    try {
      const users = await fetchUsersFromApi();
      const storedUserId = readStoredUserId();
      const currentUser =
        users.find((user) => user.id === storedUserId) ||
        users[0] ||
        null;

      writeStoredUserId(currentUser?.id || null);
      set({
        users,
        currentUser,
        hasHydrated: true,
        isLoading: false,
      });
    } catch {
      set({
        users: [],
        currentUser: null,
        hasHydrated: true,
        isLoading: false,
      });
    }
  },

  refreshUsers: async () => {
    const users = await fetchUsersFromApi();
    const selectedId = get().currentUser?.id || readStoredUserId();
    const currentUser = users.find((user) => user.id === selectedId) || users[0] || null;
    writeStoredUserId(currentUser?.id || null);
    set({ users, currentUser });
  },

  selectUser: (userId) => {
    const user = get().users.find((entry) => entry.id === userId) || null;
    writeStoredUserId(user?.id || null);
    set({ currentUser: user });
  },

  logout: () => {
    writeStoredUserId(null);
    set({ currentUser: null });
  },

  addUser: async (name) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName }),
    });
    if (!response.ok) {
      return null;
    }

    const nextUser = (await response.json()) as User;
    const users = await fetchUsersFromApi();
    writeStoredUserId(nextUser.id);
    set({
      users,
      currentUser: users.find((user) => user.id === nextUser.id) || nextUser,
    });
    return nextUser;
  },

  removeUser: async (userId) => {
    const response = await fetch(`/api/users?id=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return false;
    }

    const users = await fetchUsersFromApi();
    const currentUser =
      get().currentUser?.id === userId
        ? users[0] || null
        : users.find((user) => user.id === get().currentUser?.id) || users[0] || null;
    writeStoredUserId(currentUser?.id || null);
    set({ users, currentUser });
    return true;
  },
}));
