import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
    id: string;
    name: string;
    avatar?: string;
    role: 'admin' | 'user' | 'guest';
    preferences: {
        theme: 'light' | 'dark' | 'system';
    };
}

interface UserState {
    users: User[];
    currentUser: User | null;
    hasHydrated: boolean;
    selectUser: (userId: string) => void;
    logout: () => void;
    addUser: (name: string) => void;
    removeUser: (userId: string) => void;
    setHasHydrated: (value: boolean) => void;
}

const DEFAULT_USERS: User[] = [
    {
        id: 'u1',
        name: 'Emirhan',
        role: 'admin',
        preferences: { theme: 'dark' }
    },
    {
        id: 'u2',
        name: 'Yatırımcı',
        role: 'user',
        preferences: { theme: 'system' }
    },
    {
        id: 'u3',
        name: 'Misafir',
        role: 'guest',
        preferences: { theme: 'light' }
    }
];

export const useUserStore = create<UserState>()(
    persist(
        (set, get) => ({
            users: DEFAULT_USERS,
            currentUser: null, // Starts as null to show profile selector
            hasHydrated: false,

            setHasHydrated: (value) => {
                set({ hasHydrated: value });
            },

            selectUser: (userId) => {
                const user = get().users.find(u => u.id === userId);
                if (user) {
                    set({ currentUser: user });
                }
            },

            logout: () => {
                set({ currentUser: null });
            },

            addUser: (name) => {
                const trimmedName = name.trim();
                if (!trimmedName) return;

                const newUser: User = {
                    id: `u${Date.now()}`,
                    name: trimmedName,
                    role: 'user',
                    preferences: { theme: 'system' }
                };
                set(state => ({ users: [...state.users, newUser] }));
            },

            removeUser: (userId) => {
                const { users, currentUser } = get();
                if (users.length <= 1) return;

                const nextUsers = users.filter(user => user.id !== userId);
                const nextCurrentUser = currentUser?.id === userId ? null : currentUser;

                set({
                    users: nextUsers,
                    currentUser: nextCurrentUser,
                });
            }
        }),
        {
            name: 'trade-intelligence-users',
            partialize: (state) => ({
                users: state.users,
                currentUser: state.currentUser
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);
