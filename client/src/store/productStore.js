import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useProductStore = create(
  persist(
    (set, get) => ({
      ItemId: '',
      AllProducts: [],
      filteredProducts: [],
      productObj: {},
      sku: '',
      searchProduct: '',
      entriesLimit: 5,
      competitors: [],
      modifyCompetitors: (competitors) => set({ competitors }),
      modifySearch: (searchProduct) => set({ searchProduct }),
      setEntriesLimit: (entriesLimit) => set({ entriesLimit }),
      performSearch: ({ search, limit }) => {
        const all = Array.isArray(get().AllProducts) ? get().AllProducts : [];
        let filtered = all;

        if (search) {
          filtered = all.filter(
            (product) =>
              product.name?.toLowerCase().includes(search.toLowerCase()) ||
              product.id?.toString().includes(search) ||
              product.productId?.toString().includes(search)
          );
        }

        if (limit) {
          filtered = filtered.slice(0, limit);
        }

        set({ filteredProducts: filtered });
      },
      modifyProductsObj: (productObj) => set({ productObj }),
      modifyProductsArray: (AllProducts) => set({ AllProducts }),
      modifyProductsId: (ItemId) => set({ ItemId }),
      modifySku: (sku) => set({ sku }),
    }),
    {
      name: 'product-store',
      whitelist: [
        'searchProduct',
        'entriesLimit',
        'sku',
        'ItemId',
        'competitors',
      ],
      partialize: (state) => {
        // Only persist the properties you want
        const { AllProducts, filteredProducts, ...toKeep } = state;
        return toKeep;
      },
    }
  )
);
