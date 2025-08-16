import { useCallback, useRef, useState, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

const globalCache = new DataCache();

// Cleanup expired entries every 5 minutes
setInterval(() => globalCache.cleanup(), 5 * 60 * 1000);

export const useOptimizedData = <T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: {
    ttl?: number;
    refreshOnFocus?: boolean;
    retryOnError?: boolean;
    maxRetries?: number;
  } = {}
) => {
  const {
    ttl = 5 * 60 * 1000,
    refreshOnFocus = true,
    retryOnError = true,
    maxRetries = 3,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const lastFetchRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (force: boolean = false) => {
      const now = Date.now();
      
      // Check cache first
      if (!force) {
        const cached = globalCache.get<T>(key);
        if (cached) {
          setData(cached);
          return cached;
        }
      }

      // Prevent concurrent requests
      if (isLoading && !force) return;

      // Rate limiting
      if (!force && now - lastFetchRef.current < 1000) return;

      setIsLoading(true);
      setError(null);

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      try {
        const result = await fetchFn();
        
        setData(result);
        globalCache.set(key, result, ttl);
        lastFetchRef.current = now;
        setRetryCount(0);
        
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        
        if (retryOnError && retryCount < maxRetries) {
          setRetryCount(prev => prev + 1);
          // Exponential backoff
          setTimeout(() => fetchData(true), Math.pow(2, retryCount) * 1000);
        }
        
        throw err;
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [key, fetchFn, ttl, isLoading, retryOnError, retryCount, maxRetries]
  );

  const refresh = useCallback(() => {
    globalCache.invalidate(key);
    return fetchData(true);
  }, [fetchData, key]);

  const invalidate = useCallback(() => {
    globalCache.invalidate(key);
    setData(null);
  }, [key]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh on focus if enabled
  useFocusEffect(
    useCallback(() => {
      if (refreshOnFocus) {
        const cached = globalCache.get<T>(key);
        if (!cached) {
          fetchData();
        }
      }
    }, [fetchData, key, refreshOnFocus])
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    refresh,
    invalidate,
    retryCount,
  };
};

export { globalCache };