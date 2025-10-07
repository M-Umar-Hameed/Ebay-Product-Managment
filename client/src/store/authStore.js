// src/store/authStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const userStore = create(
  persist(
    (set) => ({
      // ── State ──────────────────────────────────────────────────────────
      user: null, // our backend‐user (id, email, etc.)
      authToken: null, // eBay user‐token (Bearer <token>)

      // ── Actions ───────────────────────────────────────────────────────
      saveUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),

      saveAuthToken: (token) => set({ authToken: token }),
      clearAuthToken: () => set({ authToken: null }),
    }),
    {
      name: 'user-store', // this becomes the key in localStorage
    }
  )
);
