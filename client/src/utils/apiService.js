import useProductStore from '../store/productStore.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Mock getValidAuthToken function if it doesn't exist
const getValidAuthToken = async () => {
  // Try to get token from localStorage or your auth store
  const token = localStorage.getItem('authToken') || localStorage.getItem('token');
  return token || 'mock-token';
};

class ApiService {
  constructor() {
    this.requestCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async makeRequest(url, options = {}) {
    try {
      const token = await getValidAuthToken();
      
      const defaultOptions = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      };

      const finalOptions = { ...defaultOptions, ...options };
      
      const response = await fetch(`${API_BASE_URL}${url}`, finalOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${url}`, error);
      throw error;
    }
  }

  // GET with caching
  async get(url, useCache = true) {
    const cacheKey = `GET:${url}`;
    
    if (useCache && this.requestCache.has(cacheKey)) {
      const cached = this.requestCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`📦 Using cached data for: ${url}`);
        return cached.data;
      }
    }

    const data = await this.makeRequest(url);
    
    if (useCache) {
      this.requestCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
    }
    
    return data;
  }

  // POST (no caching)
  async post(url, data) {
    return this.makeRequest(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT (no caching)
  async put(url, data) {
    return this.makeRequest(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE (no caching)
  async delete(url) {
    return this.makeRequest(url, {
      method: 'DELETE',
    });
  }

  // Clear cache for specific URL pattern
  clearCache(pattern) {
    for (const key of this.requestCache.keys()) {
      if (key.includes(pattern)) {
        this.requestCache.delete(key);
      }
    }
  }

  // Clear all cache
  clearAllCache() {
    this.requestCache.clear();
  }

  // Specific API methods with store integration
  async fetchProducts(userId, useCache = true) {
    const store = useProductStore.getState();
    
    if (useCache && store.isCacheValid('products') && store.products.length > 0) {
      console.log('📦 Using cached products from store');
      return { success: true, data: store.products };
    }

    if (store.loading.products) {
      console.log('⏳ Products already loading...');
      return new Promise((resolve) => {
        const unsubscribe = useProductStore.subscribe((state) => {
          if (!state.loading.products) {
            unsubscribe();
            resolve({ success: true, data: state.products });
          }
        });
      });
    }

    store.setProductsLoading(true);
    
    try {
      const response = await this.get(`/ebay/active-listings?userId=${userId}`, useCache);
      store.setProducts(response.data || []);
      return response;
    } catch (error) {
      store.setProductsLoading(false);
      throw error;
    }
  }

  async fetchStrategies(userId, useCache = true) {
    const store = useProductStore.getState();
    
    if (useCache && store.isCacheValid('strategies') && store.strategies.length > 0) {
      console.log('📦 Using cached strategies from store');
      return { success: true, strategies: store.strategies };
    }

    if (store.loading.strategies) {
      console.log('⏳ Strategies already loading...');
      return new Promise((resolve) => {
        const unsubscribe = useProductStore.subscribe((state) => {
          if (!state.loading.strategies) {
            unsubscribe();
            resolve({ success: true, strategies: state.strategies });
          }
        });
      });
    }

    store.setStrategiesLoading(true);
    
    try {
      const response = await this.get(`/pricing-strategies?userId=${userId}`, useCache);
      store.setStrategies(response.strategies || []);
      return response;
    } catch (error) {
      store.setStrategiesLoading(false);
      throw error;
    }
  }

  async fetchCompetitorRules(userId, useCache = true) {
    const store = useProductStore.getState();
    
    if (useCache && store.isCacheValid('competitorRules') && store.competitorRules.length > 0) {
      console.log('📦 Using cached competitor rules from store');
      return { success: true, rules: store.competitorRules };
    }

    if (store.loading.competitorRules) {
      console.log('⏳ Competitor rules already loading...');
      return new Promise((resolve) => {
        const unsubscribe = useProductStore.subscribe((state) => {
          if (!state.loading.competitorRules) {
            unsubscribe();
            resolve({ success: true, rules: state.competitorRules });
          }
        });
      });
    }

    store.setCompetitorRulesLoading(true);
    
    try {
      const response = await this.get(`/competitor-rules?userId=${userId}`, useCache);
      store.setCompetitorRules(response.rules || []);
      return response;
    } catch (error) {
      store.setCompetitorRulesLoading(false);
      throw error;
    }
  }
}

const apiService = new ApiService();
export default apiService;
