import React, { useState, useCallback, memo } from "react";
import {
  Image,
  ImageProps,
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from "react-native";
import { RefreshCw } from "lucide-react-native";

interface OptimizedImageProps extends Omit<ImageProps, "onLoad" | "onError"> {
  source: { uri: string } | number;
  fallbackSource?: { uri: string } | number;
  showLoader?: boolean;
  showRetry?: boolean;
  retryText?: string;
  placeholder?: React.ReactNode;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: (error: any) => void;
}

const OptimizedImage = memo<OptimizedImageProps>(({
  source,
  fallbackSource,
  showLoader = true,
  showRetry = true,
  retryText = "Retry",
  placeholder,
  onLoadStart,
  onLoadEnd,
  onError,
  style,
  ...props
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentSource, setCurrentSource] = useState(source);

  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    onLoadStart?.();
  }, [onLoadStart]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onLoadEnd?.();
  }, [onLoadEnd]);

  const handleError = useCallback((error: any) => {
    console.error("🖼️ Image load error:", error);
    setIsLoading(false);
    setHasError(true);
    
    // Try fallback source if available and not already tried
    if (fallbackSource && currentSource !== fallbackSource && retryCount === 0) {
      setCurrentSource(fallbackSource);
      setRetryCount(1);
      setHasError(false);
      setIsLoading(true);
      return;
    }
    
    onError?.(error);
  }, [fallbackSource, currentSource, retryCount, onError]);

  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
    setHasError(false);
    setIsLoading(true);
    setCurrentSource(source); // Reset to original source
  }, [source]);

  const renderContent = () => {
    if (hasError) {
      return (
        <View style={[styles.errorContainer, style]}>
          <Text style={styles.errorText}>Failed to load image</Text>
          {showRetry && (
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <RefreshCw size={16} color="#6b7280" />
              <Text style={styles.retryText}>{retryText}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={style}>
        <Image
          {...props}
          source={currentSource}
          style={[StyleSheet.absoluteFillObject, props.style]}
          onLoadStart={handleLoadStart}
          onLoad={handleLoad}
          onError={handleError}
          resizeMode={props.resizeMode || "cover"}
        />
        
        {isLoading && showLoader && (
          <View style={styles.loaderContainer}>
            {placeholder || (
              <>
                <ActivityIndicator size="small" color="#10b981" />
                <Text style={styles.loadingText}>Loading...</Text>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return renderContent();
});

const styles = StyleSheet.create({
  errorContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    padding: 16,
  },
  errorText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  retryText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  loaderContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
  loadingText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 8,
  },
});

OptimizedImage.displayName = "OptimizedImage";

export default OptimizedImage;