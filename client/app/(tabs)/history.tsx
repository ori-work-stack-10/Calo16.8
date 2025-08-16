import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Search,
  Filter,
  Star,
  Copy,
  Edit3,
  Trash2,
  Heart,
  Clock,
  Flame,
  Target,
  ChevronDown,
  X,
} from "lucide-react-native";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/src/store";
import { fetchMeals } from "@/src/store/mealSlice";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/src/i18n/context/LanguageContext";
import { nutritionAPI, APIError } from "@/src/services/api";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { useOptimizedData } from "@/hooks/useOptimizedData";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoadingSpinner from "@/components/LoadingSpinner";
import SkeletonLoader, { SkeletonCard, SkeletonList } from "@/components/SkeletonLoader";
import OptimizedImage from "@/components/OptimizedImage";

const { width } = Dimensions.get("window");

interface FilterOptions {
  category: string;
  dateRange: string;
  minCalories: string;
  maxCalories: string;
  sortBy: string;
  showFavoritesOnly: boolean;
}

interface MealFeedback {
  tasteRating: number;
  satietyRating: number;
  energyRating: number;
  heavinessRating: number;
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const dispatch = useDispatch<AppDispatch>();
  const { handleError, handleSuccess } = useErrorHandler();
  
  const { meals, isLoading: mealsLoading } = useSelector((state: RootState) => state.meal);
  
  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<any>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<FilterOptions>({
    category: "all",
    dateRange: "all",
    minCalories: "",
    maxCalories: "",
    sortBy: "newest",
    showFavoritesOnly: false,
  });

  const [ratings, setRatings] = useState<MealFeedback>({
    tasteRating: 0,
    satietyRating: 0,
    energyRating: 0,
    heavinessRating: 0,
  });

  // Optimized data fetching with caching
  const {
    data: optimizedMeals,
    isLoading: dataLoading,
    error: dataError,
    refresh: refreshData,
  } = useOptimizedData(
    "user-meals",
    () => nutritionAPI.getMeals(),
    {
      ttl: 2 * 60 * 1000, // 2 minutes cache
      refreshOnFocus: true,
    }
  );

  // Use optimized meals if available, fallback to Redux
  const mealsData = optimizedMeals || meals || [];

  // Memoized filtered and sorted meals
  const filteredMeals = useMemo(() => {
    let filtered = [...mealsData];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (meal) =>
          meal.name?.toLowerCase().includes(query) ||
          meal.meal_name?.toLowerCase().includes(query) ||
          meal.description?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (filters.category !== "all") {
      filtered = filtered.filter((meal) => {
        const calories = meal.calories || 0;
        switch (filters.category) {
          case "high_protein":
            return (meal.protein || meal.protein_g || 0) > 20;
          case "high_carb":
            return (meal.carbs || meal.carbs_g || 0) > 30;
          case "high_fat":
            return (meal.fat || meal.fats_g || 0) > 15;
          case "low_calorie":
            return calories < 300;
          case "high_calorie":
            return calories > 600;
          default:
            return true;
        }
      });
    }

    // Calorie range filter
    if (filters.minCalories) {
      const min = parseInt(filters.minCalories);
      filtered = filtered.filter((meal) => (meal.calories || 0) >= min);
    }
    if (filters.maxCalories) {
      const max = parseInt(filters.maxCalories);
      filtered = filtered.filter((meal) => (meal.calories || 0) <= max);
    }

    // Favorites filter
    if (filters.showFavoritesOnly) {
      filtered = filtered.filter((meal) => meal.isFavorite || meal.is_favorite);
    }

    // Date range filter
    if (filters.dateRange !== "all") {
      const now = new Date();
      const filterDate = new Date();
      
      switch (filters.dateRange) {
        case "today":
          filterDate.setHours(0, 0, 0, 0);
          break;
        case "week":
          filterDate.setDate(now.getDate() - 7);
          break;
        case "month":
          filterDate.setMonth(now.getMonth() - 1);
          break;
      }
      
      filtered = filtered.filter(
        (meal) => new Date(meal.created_at || meal.upload_time) >= filterDate
      );
    }

    // Sort meals
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case "newest":
          return new Date(b.created_at || b.upload_time).getTime() - 
                 new Date(a.created_at || a.upload_time).getTime();
        case "oldest":
          return new Date(a.created_at || a.upload_time).getTime() - 
                 new Date(b.created_at || b.upload_time).getTime();
        case "calories_high":
          return (b.calories || 0) - (a.calories || 0);
        case "calories_low":
          return (a.calories || 0) - (b.calories || 0);
        case "name":
          return (a.name || a.meal_name || "").localeCompare(b.name || b.meal_name || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [mealsData, searchQuery, filters]);

  // Load meals on component mount
  useEffect(() => {
    if (!optimizedMeals && mealsData.length === 0) {
      dispatch(fetchMeals());
    }
  }, [dispatch, optimizedMeals, mealsData.length]);

  // Refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshData(),
        dispatch(fetchMeals()).unwrap(),
      ]);
    } catch (error) {
      handleError(error, "refresh meals");
    } finally {
      setRefreshing(false);
    }
  }, [refreshData, dispatch, handleError]);

  // Meal actions with optimistic updates
  const handleToggleFavorite = useCallback(async (meal: any) => {
    if (actionLoading) return;
    
    setActionLoading(`favorite-${meal.id || meal.meal_id}`);
    
    try {
      await nutritionAPI.toggleMealFavorite(meal.id || meal.meal_id.toString());
      
      // Optimistic update
      const updatedMeals = mealsData.map(m => 
        (m.id || m.meal_id) === (meal.id || meal.meal_id)
          ? { ...m, isFavorite: !m.isFavorite, is_favorite: !m.is_favorite }
          : m
      );
      
      // Update cache
      refreshData();
      handleSuccess(t("history.favorite_updated"));
    } catch (error) {
      handleError(error, "toggle favorite");
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, mealsData, refreshData, handleSuccess, handleError, t]);

  const handleDuplicateMeal = useCallback(async (meal: any) => {
    if (actionLoading) return;
    
    Alert.alert(
      t("history.duplicate_meal"),
      t("history.duplicate_confirmation"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("history.duplicate"),
          onPress: async () => {
            setActionLoading(`duplicate-${meal.id || meal.meal_id}`);
            
            try {
              await nutritionAPI.duplicateMeal(meal.id || meal.meal_id.toString());
              await refreshData();
              dispatch(fetchMeals());
              handleSuccess(t("history.meal_duplicated"));
            } catch (error) {
              handleError(error, "duplicate meal");
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }, [actionLoading, refreshData, dispatch, handleSuccess, handleError, t]);

  const handleUpdateMeal = useCallback(async () => {
    if (!selectedMeal || !updateText.trim() || actionLoading) return;
    
    setActionLoading(`update-${selectedMeal.id || selectedMeal.meal_id}`);
    
    try {
      await nutritionAPI.updateMeal(
        selectedMeal.id || selectedMeal.meal_id.toString(),
        updateText.trim()
      );
      
      await refreshData();
      dispatch(fetchMeals());
      setShowUpdateModal(false);
      setUpdateText("");
      setSelectedMeal(null);
      handleSuccess(t("history.meal_updated"));
    } catch (error) {
      handleError(error, "update meal");
    } finally {
      setActionLoading(null);
    }
  }, [selectedMeal, updateText, actionLoading, refreshData, dispatch, handleSuccess, handleError, t]);

  const handleSaveFeedback = useCallback(async () => {
    if (!selectedMeal || actionLoading) return;
    
    setActionLoading(`feedback-${selectedMeal.id || selectedMeal.meal_id}`);
    
    try {
      await nutritionAPI.saveMealFeedback(
        selectedMeal.id || selectedMeal.meal_id.toString(),
        ratings
      );
      
      setShowRatingModal(false);
      setSelectedMeal(null);
      setRatings({
        tasteRating: 0,
        satietyRating: 0,
        energyRating: 0,
        heavinessRating: 0,
      });
      handleSuccess(t("history.feedback_saved"));
    } catch (error) {
      handleError(error, "save feedback");
    } finally {
      setActionLoading(null);
    }
  }, [selectedMeal, ratings, actionLoading, handleSuccess, handleError, t]);

  const renderMealCard = useCallback((meal: any, index: number) => {
    const mealId = meal.id || meal.meal_id;
    const isActionLoading = actionLoading?.includes(mealId.toString());

    return (
      <View key={mealId} style={styles.mealCard}>
        <View style={styles.mealImageContainer}>
          <OptimizedImage
            source={{ uri: meal.image_url || meal.imageUrl }}
            style={styles.mealImage}
            fallbackSource={require("@/assets/images/placeholder-meal.png")}
            showLoader={true}
            placeholder={<SkeletonLoader width="100%" height="100%" />}
          />
        </View>

        <View style={styles.mealInfo}>
          <Text style={styles.mealName} numberOfLines={2}>
            {meal.name || meal.meal_name || t("meals.unknown_meal")}
          </Text>
          
          <Text style={styles.mealTime}>
            {new Date(meal.created_at || meal.upload_time).toLocaleString()}
          </Text>

          <View style={styles.nutritionRow}>
            <View style={styles.nutritionItem}>
              <Flame size={14} color="#ef4444" />
              <Text style={styles.nutritionText}>
                {Math.round(meal.calories || 0)} {t("meals.kcal")}
              </Text>
            </View>
            
            <View style={styles.nutritionItem}>
              <Target size={14} color="#10b981" />
              <Text style={styles.nutritionText}>
                {Math.round(meal.protein || meal.protein_g || 0)}g
              </Text>
            </View>
          </View>

          {/* Rating display */}
          {(meal.tasteRating || meal.taste_rating) > 0 && (
            <View style={styles.ratingContainer}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={12}
                  color={i < (meal.tasteRating || meal.taste_rating) ? "#fbbf24" : "#d1d5db"}
                  fill={i < (meal.tasteRating || meal.taste_rating) ? "#fbbf24" : "transparent"}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.mealActions}>
          {/* Favorite button */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              (meal.isFavorite || meal.is_favorite) && styles.favoriteActive,
            ]}
            onPress={() => handleToggleFavorite(meal)}
            disabled={isActionLoading}
          >
            {isActionLoading && actionLoading === `favorite-${mealId}` ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <Heart
                size={16}
                color={(meal.isFavorite || meal.is_favorite) ? "#ef4444" : "#6b7280"}
                fill={(meal.isFavorite || meal.is_favorite) ? "#ef4444" : "transparent"}
              />
            )}
          </TouchableOpacity>

          {/* Rate button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              setSelectedMeal(meal);
              setRatings({
                tasteRating: meal.tasteRating || meal.taste_rating || 0,
                satietyRating: meal.satietyRating || meal.satiety_rating || 0,
                energyRating: meal.energyRating || meal.energy_rating || 0,
                heavinessRating: meal.heavinessRating || meal.heaviness_rating || 0,
              });
              setShowRatingModal(true);
            }}
            disabled={isActionLoading}
          >
            <Star size={16} color="#fbbf24" />
          </TouchableOpacity>

          {/* Duplicate button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDuplicateMeal(meal)}
            disabled={isActionLoading}
          >
            {isActionLoading && actionLoading === `duplicate-${mealId}` ? (
              <ActivityIndicator size="small" color="#10b981" />
            ) : (
              <Copy size={16} color="#10b981" />
            )}
          </TouchableOpacity>

          {/* Update button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              setSelectedMeal(meal);
              setShowUpdateModal(true);
            }}
            disabled={isActionLoading}
          >
            <Edit3 size={16} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [actionLoading, handleToggleFavorite, handleDuplicateMeal, t]);

  const renderRatingModal = () => (
    <Modal
      visible={showRatingModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowRatingModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("history.rate_meal")}</Text>
            <TouchableOpacity onPress={() => setShowRatingModal(false)}>
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.ratingSection}>
            {[
              { key: "tasteRating", label: t("history.taste") },
              { key: "satietyRating", label: t("history.satiety") },
              { key: "energyRating", label: t("history.energy") },
              { key: "heavinessRating", label: t("history.heaviness") },
            ].map(({ key, label }) => (
              <View key={key} style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>{label}</Text>
                <View style={styles.starsContainer}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() =>
                        setRatings((prev) => ({ ...prev, [key]: i + 1 }))
                      }
                    >
                      <Star
                        size={24}
                        color={i < ratings[key as keyof MealFeedback] ? "#fbbf24" : "#d1d5db"}
                        fill={i < ratings[key as keyof MealFeedback] ? "#fbbf24" : "transparent"}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setShowRatingModal(false)}
            >
              <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton]}
              onPress={handleSaveFeedback}
              disabled={!!actionLoading}
            >
              {actionLoading?.includes("feedback") ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>{t("common.save")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderUpdateModal = () => (
    <Modal
      visible={showUpdateModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowUpdateModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("history.update_meal")}</Text>
            <TouchableOpacity onPress={() => setShowUpdateModal(false)}>
              <X size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.updateInput}
            value={updateText}
            onChangeText={setUpdateText}
            placeholder={t("history.add_additional_info")}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => {
                setShowUpdateModal(false);
                setUpdateText("");
              }}
            >
              <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.saveButton,
                !updateText.trim() && styles.disabledButton,
              ]}
              onPress={handleUpdateMeal}
              disabled={!updateText.trim() || !!actionLoading}
            >
              {actionLoading?.includes("update") ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>{t("common.update")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Category:</Text>
        <TouchableOpacity
          style={styles.filterDropdown}
          onPress={() => {
            // Implement category selector
          }}
        >
          <Text style={styles.filterValue}>
            {filters.category === "all" ? "All" : filters.category}
          </Text>
          <ChevronDown size={16} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Sort by:</Text>
        <TouchableOpacity
          style={styles.filterDropdown}
          onPress={() => {
            // Implement sort selector
          }}
        >
          <Text style={styles.filterValue}>
            {filters.sortBy === "newest" ? "Newest" : filters.sortBy}
          </Text>
          <ChevronDown size={16} color="#6b7280" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // Loading state
  if (dataLoading || mealsLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("history.title")}</Text>
        </View>
        <SkeletonList
          items={8}
          renderItem={() => <SkeletonCard />}
          style={styles.skeletonContainer}
        />
      </SafeAreaView>
    );
  }

  // Error state
  if (dataError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{dataError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t("history.title")}</Text>
          
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter size={20} color="#10b981" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Search size={20} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("history.search_meals")}
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* Filters */}
        {showFilters && renderFilters()}

        {/* Meals List */}
        <ScrollView
          style={styles.mealsContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#10b981"]}
              tintColor="#10b981"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {filteredMeals.length > 0 ? (
            filteredMeals.map(renderMealCard)
          ) : (
            <View style={styles.emptyState}>
              <Clock size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>
                {searchQuery ? "No meals found" : t("history.no_meals")}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? "Try adjusting your search or filters"
                  : t("history.start_logging")}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Modals */}
        {renderRatingModal()}
        {renderUpdateModal()}
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
  },
  filterButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#374151",
  },
  filtersContainer: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  filterDropdown: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  filterValue: {
    fontSize: 14,
    color: "#6b7280",
  },
  mealsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  mealCard: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mealImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: "hidden",
    marginRight: 16,
  },
  mealImage: {
    width: "100%",
    height: "100%",
  },
  mealInfo: {
    flex: 1,
    justifyContent: "space-between",
  },
  mealName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  mealTime: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  nutritionRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  nutritionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  nutritionText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
  },
  ratingContainer: {
    flexDirection: "row",
    gap: 2,
  },
  mealActions: {
    justifyContent: "space-around",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
  },
  favoriteActive: {
    backgroundColor: "#fef2f2",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: width - 40,
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  ratingSection: {
    gap: 16,
    marginBottom: 24,
  },
  ratingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ratingLabel: {
    fontSize: 16,
    color: "#374151",
    fontWeight: "500",
  },
  starsContainer: {
    flexDirection: "row",
    gap: 4,
  },
  updateInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#374151",
    minHeight: 100,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f3f4f6",
  },
  saveButton: {
    backgroundColor: "#10b981",
  },
  disabledButton: {
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  skeletonContainer: {
    padding: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});