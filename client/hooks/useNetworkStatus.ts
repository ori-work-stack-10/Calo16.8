import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
}

export const useNetworkStatus = () => {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: null,
    type: null,
  });

  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupNetworkListener = async () => {
      if (Platform.OS === "web") {
        // Web implementation
        const updateOnlineStatus = () => {
          const online = navigator.onLine;
          setIsOnline(online);
          setNetworkState({
            isConnected: online,
            isInternetReachable: online,
            type: online ? "wifi" : null,
          });
        };

        window.addEventListener("online", updateOnlineStatus);
        window.addEventListener("offline", updateOnlineStatus);
        
        // Initial check
        updateOnlineStatus();

        return () => {
          window.removeEventListener("online", updateOnlineStatus);
          window.removeEventListener("offline", updateOnlineStatus);
        };
      } else {
        // React Native implementation
        try {
          const NetInfo = await import("@react-native-community/netinfo");
          
          // Get initial state
          const state = await NetInfo.default.fetch();
          setNetworkState({
            isConnected: state.isConnected ?? false,
            isInternetReachable: state.isInternetReachable,
            type: state.type,
          });
          setIsOnline(state.isConnected ?? false);

          // Subscribe to network state updates
          unsubscribe = NetInfo.default.addEventListener((state) => {
            setNetworkState({
              isConnected: state.isConnected ?? false,
              isInternetReachable: state.isInternetReachable,
              type: state.type,
            });
            setIsOnline(state.isConnected ?? false);
          });
        } catch (error) {
          console.warn("NetInfo not available, using fallback");
          // Fallback for when NetInfo is not available
          setNetworkState({
            isConnected: true,
            isInternetReachable: true,
            type: "unknown",
          });
          setIsOnline(true);
        }
      }
    };

    setupNetworkListener();

    return () => {
      unsubscribe?.();
    };
  }, []);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === "web") {
        return navigator.onLine;
      } else {
        const NetInfo = await import("@react-native-community/netinfo");
        const state = await NetInfo.default.fetch();
        return state.isConnected ?? false;
      }
    } catch (error) {
      console.warn("Failed to check connectivity:", error);
      return true; // Assume connected if check fails
    }
  }, []);

  const waitForConnection = useCallback(
    (timeout: number = 10000): Promise<boolean> => {
      return new Promise((resolve) => {
        if (networkState.isConnected) {
          resolve(true);
          return;
        }

        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          if (networkState.isConnected) {
            clearInterval(checkInterval);
            resolve(true);
          } else if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            resolve(false);
          }
        }, 1000);
      });
    },
    [networkState.isConnected]
  );

  return {
    ...networkState,
    isOnline,
    checkConnectivity,
    waitForConnection,
  };
};