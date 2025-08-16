import { useCallback } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { APIError } from "@/src/services/api";

export const useErrorHandler = () => {
  const { t } = useTranslation();

  const handleError = useCallback(
    (error: unknown, context?: string, onRetry?: () => void) => {
      console.error(`💥 Error in ${context || "unknown context"}:`, error);

      let title = t("common.error");
      let message = t("common.network_error");

      if (error instanceof APIError) {
        message = error.message;
        
        // Provide specific error messages based on status
        switch (error.status) {
          case 401:
            message = "Your session has expired. Please sign in again.";
            break;
          case 403:
            message = "You don't have permission to perform this action.";
            break;
          case 404:
            message = "The requested resource was not found.";
            break;
          case 429:
            message = "Too many requests. Please wait a moment and try again.";
            break;
          case 500:
            message = "Server error. Please try again later.";
            break;
        }
      } else if (error instanceof Error) {
        message = error.message;
      }

      const buttons = [
        {
          text: t("common.ok"),
          style: "default" as const,
        },
      ];

      if (onRetry && error instanceof APIError && error.retryable) {
        buttons.unshift({
          text: t("common.retry"),
          onPress: onRetry,
          style: "default" as const,
        });
      }

      Alert.alert(title, message, buttons);
    },
    [t]
  );

  const handleSuccess = useCallback(
    (message: string) => {
      Alert.alert(t("common.success"), message);
    },
    [t]
  );

  const handleWarning = useCallback(
    (message: string, onConfirm?: () => void) => {
      Alert.alert(
        t("common.warning"),
        message,
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.continue"), onPress: onConfirm },
        ]
      );
    },
    [t]
  );

  return {
    handleError,
    handleSuccess,
    handleWarning,
  };
};