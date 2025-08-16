import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { SignUpData, SignInData, MealAnalysisData, QuestionnaireData } from "../types";

// Enhanced error handling and retry logic
class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "APIError";
  }
}

// Optimized API configuration
const getApiBaseUrl = (): string => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new Error("API_URL environment variable is not configured");
  }
  return baseUrl;
};

// Enhanced axios instance with better error handling
const createApiInstance = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: getApiBaseUrl(),
    timeout: 30000, // 30 second timeout
    withCredentials: Platform.OS === "web",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  // Request interceptor for auth tokens
  instance.interceptors.request.use(
    async (config) => {
      try {
        const token = await getStoredToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.warn("Failed to get stored token:", error);
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Enhanced response interceptor with retry logic
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as any;

      // Handle network errors with retry
      if (!error.response && !originalRequest._retry) {
        originalRequest._retry = true;
        console.log("🔄 Retrying failed network request...");
        
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        return instance(originalRequest);
      }

      // Handle 401 errors (token expiration)
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        
        try {
          // Clear invalid token
          await clearStoredToken();
          console.log("🔄 Token expired, cleared from storage");
        } catch (clearError) {
          console.warn("Failed to clear token:", clearError);
        }
      }

      // Transform error for better handling
      const apiError = new APIError(
        error.response?.data?.error || error.message || "Network error",
        error.response?.status,
        error.code,
        error.response?.status ? error.response.status >= 500 : true
      );

      return Promise.reject(apiError);
    }
  );

  return instance;
};

const api = createApiInstance();

// Enhanced token management with error handling
const getStoredToken = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem("auth_token");
    } else {
      return await SecureStore.getItemAsync("auth_token_secure");
    }
  } catch (error) {
    console.error("Error getting stored token:", error);
    return null;
  }
};

const setStoredToken = async (token: string): Promise<void> => {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem("auth_token", token);
    } else {
      await SecureStore.setItemAsync("auth_token_secure", token);
    }
  } catch (error) {
    console.error("Error storing token:", error);
    throw new APIError("Failed to store authentication token");
  }
};

const clearStoredToken = async (): Promise<void> => {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem("auth_token");
    } else {
      await SecureStore.deleteItemAsync("auth_token_secure");
    }
  } catch (error) {
    console.error("Error clearing token:", error);
  }
};

// Enhanced API service with comprehensive error handling
export const authAPI = {
  async signUp(data: SignUpData): Promise<any> {
    try {
      console.log("🔄 Signing up user...");
      const response = await api.post("/auth/signup", data);
      
      if (response.data.success) {
        console.log("✅ Signup successful");
        return response.data;
      }
      
      throw new APIError(response.data.error || "Signup failed");
    } catch (error) {
      console.error("💥 Signup error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error during signup", undefined, undefined, true);
    }
  },

  async signIn(data: SignInData): Promise<any> {
    try {
      console.log("🔄 Signing in user...");
      const response = await api.post("/auth/signin", data);
      
      if (response.data.success && response.data.token) {
        await setStoredToken(response.data.token);
        console.log("✅ Signin successful, token stored");
        return response.data;
      }
      
      throw new APIError(response.data.error || "Signin failed");
    } catch (error) {
      console.error("💥 Signin error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error during signin", undefined, undefined, true);
    }
  },

  async verifyEmail(email: string, code: string): Promise<any> {
    try {
      console.log("🔄 Verifying email...");
      const response = await api.post("/auth/verify-email", { email, code });
      
      if (response.data.success && response.data.token) {
        await setStoredToken(response.data.token);
        console.log("✅ Email verification successful");
        return response.data;
      }
      
      throw new APIError(response.data.error || "Email verification failed");
    } catch (error) {
      console.error("💥 Email verification error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error during email verification", undefined, undefined, true);
    }
  },

  async signOut(): Promise<void> {
    try {
      await api.post("/auth/signout");
      await clearStoredToken();
      console.log("✅ Signout successful");
    } catch (error) {
      console.error("💥 Signout error:", error);
      // Always clear token even if server request fails
      await clearStoredToken();
    }
  },

  async getStoredToken(): Promise<string | null> {
    return getStoredToken();
  },
};

// Enhanced nutrition API with better error handling
export const nutritionAPI = {
  async analyzeMeal(
    imageBase64: string,
    updateText?: string,
    editedIngredients: any[] = [],
    language: string = "english"
  ): Promise<any> {
    try {
      console.log("🔄 Analyzing meal...");
      
      if (!imageBase64 || imageBase64.trim() === "") {
        throw new APIError("Image data is required");
      }

      const response = await api.post("/nutrition/analyze", {
        imageBase64: imageBase64.trim(),
        updateText,
        editedIngredients,
        language,
      });

      if (response.data.success) {
        console.log("✅ Meal analysis successful");
        return response.data;
      }

      throw new APIError(response.data.error || "Analysis failed");
    } catch (error) {
      console.error("💥 Meal analysis error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error during meal analysis", undefined, undefined, true);
    }
  },

  async saveMeal(mealData: MealAnalysisData, imageBase64?: string): Promise<any> {
    try {
      console.log("🔄 Saving meal...");
      const response = await api.post("/nutrition/save", {
        mealData,
        imageBase64,
      });

      if (response.data.success) {
        console.log("✅ Meal saved successfully");
        return response.data.data;
      }

      throw new APIError(response.data.error || "Failed to save meal");
    } catch (error) {
      console.error("💥 Save meal error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error while saving meal", undefined, undefined, true);
    }
  },

  async getMeals(offset: number = 0, limit: number = 100): Promise<any[]> {
    try {
      console.log("🔄 Fetching meals...");
      const response = await api.get(`/nutrition/meals?offset=${offset}&limit=${limit}`);
      
      if (response.data.success) {
        console.log(`✅ Fetched ${response.data.data.length} meals`);
        return response.data.data;
      }

      throw new APIError(response.data.error || "Failed to fetch meals");
    } catch (error) {
      console.error("💥 Get meals error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error while fetching meals", undefined, undefined, true);
    }
  },

  async updateMeal(mealId: string, updateText: string): Promise<any> {
    try {
      console.log("🔄 Updating meal...");
      const response = await api.put("/nutrition/update", {
        meal_id: mealId,
        updateText,
      });

      if (response.data.success) {
        console.log("✅ Meal updated successfully");
        return response.data;
      }

      throw new APIError(response.data.error || "Failed to update meal");
    } catch (error) {
      console.error("💥 Update meal error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error while updating meal", undefined, undefined, true);
    }
  },

  async getDailyStats(date: string): Promise<any> {
    try {
      const response = await api.get(`/nutrition/stats/daily?date=${date}`);
      return response.data.success ? response.data.data : {};
    } catch (error) {
      console.error("💥 Get daily stats error:", error);
      return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, meal_count: 0 };
    }
  },

  async getRangeStatistics(startDate: string, endDate: string): Promise<any> {
    try {
      console.log("📊 Fetching range statistics:", { startDate, endDate });
      
      const response = await api.get("/nutrition/stats/range", {
        params: { startDate, endDate },
      });

      if (response.data.success) {
        console.log("✅ Range statistics fetched successfully");
        return response.data;
      }

      throw new APIError(response.data.error || "Failed to fetch statistics");
    } catch (error) {
      console.error("💥 Range statistics error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error while fetching statistics", undefined, undefined, true);
    }
  },

  async saveMealFeedback(mealId: string, feedback: any): Promise<any> {
    try {
      const response = await api.post(`/nutrition/meals/${mealId}/feedback`, feedback);
      return response.data;
    } catch (error) {
      console.error("💥 Save feedback error:", error);
      throw new APIError("Failed to save meal feedback");
    }
  },

  async toggleMealFavorite(mealId: string): Promise<any> {
    try {
      const response = await api.post(`/nutrition/meals/${mealId}/favorite`);
      return response.data;
    } catch (error) {
      console.error("💥 Toggle favorite error:", error);
      throw new APIError("Failed to toggle meal favorite");
    }
  },

  async duplicateMeal(mealId: string, newDate?: string): Promise<any> {
    try {
      const response = await api.post(`/nutrition/meals/${mealId}/duplicate`, {
        newDate: newDate || new Date().toISOString().split("T")[0],
      });
      return response.data;
    } catch (error) {
      console.error("💥 Duplicate meal error:", error);
      throw new APIError("Failed to duplicate meal");
    }
  },

  async removeMeal(mealId: string): Promise<void> {
    try {
      await api.delete(`/nutrition/meals/${mealId}`);
      console.log("✅ Meal removed successfully");
    } catch (error) {
      console.error("💥 Remove meal error:", error);
      throw new APIError("Failed to remove meal");
    }
  },
};

// Enhanced user API
export const userAPI = {
  async updateProfile(profileData: any): Promise<any> {
    try {
      const response = await api.put("/user/profile", profileData);
      return response.data;
    } catch (error) {
      console.error("💥 Update profile error:", error);
      throw new APIError("Failed to update profile");
    }
  },

  async updateSubscription(subscriptionType: string): Promise<any> {
    try {
      console.log("🔄 Updating subscription to:", subscriptionType);
      const response = await api.put("/user/subscription", {
        subscription_type: subscriptionType,
      });

      if (response.data.success) {
        console.log("✅ Subscription updated successfully");
        return response.data;
      }

      throw new APIError(response.data.error || "Failed to update subscription");
    } catch (error) {
      console.error("💥 Update subscription error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error while updating subscription");
    }
  },

  async getUserProfile(): Promise<any> {
    try {
      const response = await api.get("/user/profile");
      return response.data;
    } catch (error) {
      console.error("💥 Get user profile error:", error);
      throw new APIError("Failed to get user profile");
    }
  },

  async getGlobalStatistics(): Promise<any> {
    try {
      const response = await api.get("/user/global-statistics");
      return response.data;
    } catch (error) {
      console.error("💥 Get global statistics error:", error);
      throw new APIError("Failed to get global statistics");
    }
  },

  async forgotPassword(email: string): Promise<any> {
    try {
      console.log("🔄 Sending forgot password request...");
      const response = await api.post("/auth/forgot-password", { email });
      
      if (response.data.success) {
        console.log("✅ Forgot password email sent");
        return response.data;
      }

      throw new APIError(response.data.error || "Failed to send reset email");
    } catch (error) {
      console.error("💥 Forgot password error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error during password reset request");
    }
  },

  async verifyResetCode(email: string, code: string): Promise<any> {
    try {
      console.log("🔄 Verifying reset code...");
      const response = await api.post("/auth/verify-reset-code", { email, code });
      
      if (response.data.success) {
        console.log("✅ Reset code verified");
        return response.data;
      }

      throw new APIError(response.data.error || "Invalid reset code");
    } catch (error) {
      console.error("💥 Verify reset code error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error during code verification");
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<any> {
    try {
      console.log("🔄 Resetting password...");
      const response = await api.post("/auth/reset-password", {
        token,
        newPassword,
      });
      
      if (response.data.success) {
        console.log("✅ Password reset successful");
        return response.data;
      }

      throw new APIError(response.data.error || "Failed to reset password");
    } catch (error) {
      console.error("💥 Reset password error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error during password reset");
    }
  },
};

// Enhanced questionnaire API
export const questionnaireAPI = {
  async saveQuestionnaire(data: QuestionnaireData): Promise<any> {
    try {
      console.log("🔄 Saving questionnaire...");
      const response = await api.post("/questionnaire", data);
      
      if (response.data.success) {
        console.log("✅ Questionnaire saved successfully");
        return response.data;
      }

      throw new APIError(response.data.error || "Failed to save questionnaire");
    } catch (error) {
      console.error("💥 Save questionnaire error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error while saving questionnaire");
    }
  },

  async getQuestionnaire(): Promise<any> {
    try {
      const response = await api.get("/questionnaire");
      return response.data;
    } catch (error) {
      console.error("💥 Get questionnaire error:", error);
      throw new APIError("Failed to get questionnaire");
    }
  },
};

// Enhanced chat API
export const chatAPI = {
  async sendMessage(message: string, language: string = "hebrew"): Promise<any> {
    try {
      console.log("🔄 Sending chat message...");
      
      if (!message || message.trim() === "") {
        throw new APIError("Message cannot be empty");
      }

      const response = await api.post("/chat/message", {
        message: message.trim(),
        language,
      });

      if (response.data.success) {
        console.log("✅ Chat message sent successfully");
        return response.data;
      }

      throw new APIError(response.data.error || "Failed to send message");
    } catch (error) {
      console.error("💥 Chat message error:", error);
      if (error instanceof APIError) throw error;
      throw new APIError("Network error while sending message");
    }
  },

  async getChatHistory(limit: number = 50): Promise<any> {
    try {
      const response = await api.get(`/chat/history?limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error("💥 Get chat history error:", error);
      return { success: false, data: [] };
    }
  },

  async clearHistory(): Promise<any> {
    try {
      const response = await api.delete("/chat/history");
      return response.data;
    } catch (error) {
      console.error("💥 Clear chat history error:", error);
      throw new APIError("Failed to clear chat history");
    }
  },
};

// Enhanced calendar API
export const calendarAPI = {
  async getCalendarData(year: number, month: number): Promise<any> {
    try {
      const response = await api.get(`/calendar/data/${year}/${month}`);
      return response.data.success ? response.data.data : {};
    } catch (error) {
      console.error("💥 Get calendar data error:", error);
      return {};
    }
  },

  async getStatistics(year: number, month: number): Promise<any> {
    try {
      const response = await api.get(`/calendar/statistics/${year}/${month}`);
      return response.data.success ? response.data.data : null;
    } catch (error) {
      console.error("💥 Get calendar statistics error:", error);
      return null;
    }
  },

  async addEvent(date: string, title: string, type: string, description?: string): Promise<any> {
    try {
      const response = await api.post("/calendar/events", {
        date,
        title,
        type,
        description,
      });
      return response.data;
    } catch (error) {
      console.error("💥 Add event error:", error);
      throw new APIError("Failed to add event");
    }
  },

  async getEventsForDate(date: string): Promise<any[]> {
    try {
      const response = await api.get(`/calendar/events/${date}`);
      return response.data.success ? response.data.data : [];
    } catch (error) {
      console.error("💥 Get events error:", error);
      return [];
    }
  },

  async deleteEvent(eventId: string): Promise<void> {
    try {
      await api.delete(`/calendar/events/${eventId}`);
      console.log("✅ Event deleted successfully");
    } catch (error) {
      console.error("💥 Delete event error:", error);
      throw new APIError("Failed to delete event");
    }
  },
};

// Enhanced meal API
export const mealAPI = {
  async deleteMeal(mealId: string): Promise<void> {
    try {
      console.log("🔄 Deleting meal:", mealId);
      await api.delete(`/nutrition/meals/${mealId}`);
      console.log("✅ Meal deleted successfully");
    } catch (error) {
      console.error("💥 Delete meal error:", error);
      throw new APIError("Failed to delete meal");
    }
  },

  async updateMeal(mealId: string, updateData: any): Promise<any> {
    try {
      const response = await api.put(`/nutrition/meals/${mealId}`, updateData);
      return response.data;
    } catch (error) {
      console.error("💥 Update meal error:", error);
      throw new APIError("Failed to update meal");
    }
  },
};

// Export the main API instance for direct use
export { api };

// Export error class for error handling
export { APIError };