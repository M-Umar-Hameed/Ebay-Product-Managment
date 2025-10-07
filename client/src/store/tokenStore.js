import { create } from "zustand";
import { persist } from "zustand/middleware";

const SESSION_KEY = "product-store-access-token";
const TOKEN_TTL = 2 * 60 * 60 * 1000; // 2 hours

const sessionStorageEngine = {
  getItem: (name) => {
    const item = sessionStorage.getItem(name);
    if (!item) return null;

    const parsed = JSON.parse(item);
    if (Date.now() > parsed.expiry) {
      sessionStorage.removeItem(name);
      return null;
    }

    return JSON.stringify({ accessToken: parsed.value });
  },
  setItem: (name, value) => {
    const accessToken = value?.state?.accessToken;
    if (accessToken) {
      sessionStorage.setItem(
        name,
        JSON.stringify({
          value: accessToken,
          expiry: Date.now() + TOKEN_TTL,
        })
      );
    }
  },
  removeItem: (name) => sessionStorage.removeItem(name),
};

export const usetokenStore = create(
  persist(
    (set) => ({
      accessToken: "",
      modifyAuthToken: (accessToken) => {
        set({ accessToken });
        setTimeout(() => set({ accessToken: "" }), TOKEN_TTL);
      },
    }),
    {   
      name: SESSION_KEY,
      storage: sessionStorageEngine,
      partialize: (state) => ({ accessToken: state.accessToken }),
    }
  )
);
