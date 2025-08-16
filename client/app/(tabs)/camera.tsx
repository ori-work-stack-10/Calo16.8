import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import {
  Camera,
  FlipHorizontal,
  Flash,
  FlashOff,
  Image as ImageIcon,
  X,
  Check,
  RefreshCw,
  Edit3,
  Save,
  Trash2,
} from "lucide-react-native";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/src/store";
import {
  analyzeMeal,
  postMeal,
  updateMeal,
  clearPendingMeal,
  processImage,
} from "@/src/store/mealSlice";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/src/i18n/context/LanguageContext";
import { router } from "expo-router";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoadingSpinner from "@/components/LoadingSpinner";
import OptimizedImage from "@/components/OptimizedImage";

const { width, height } = Dimensions.get("window");

export default function CameraScreen() {
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const dispatch = useDispatch<AppDispatch>();
  const { handleError, handleSuccess } = useErrorHandler();
  
  const {
    pendingMeal,
    isAnalyzing,
    isPosting,
    isUpdating,
    error: mealError,
  } = useSelector((state: RootState) => state.meal);

  // Camera state
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Analysis state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editText, setEditText] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // Request permissions on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Handle pending meal from storage
  useEffect(() => {
    if (pendingMeal && !showAnalysis) {
      setShowAnalysis(true);
      if (pendingMeal.image_base_64) {
        setCapturedImage(`data:image/jpeg;base64,${pendingMeal.image_base_64}`);
      }
    }
  }, [pendingMeal, showAnalysis]);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      console.log("📸 Taking picture...");
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
        skipProcessing: false,
      });

      if (photo?.uri) {
        setCapturedImage(photo.uri);
        setShowCamera(false);
        
        // Process and analyze image
        await analyzeImage(photo.uri);
      }
    } catch (error) {
      console.error("💥 Camera error:", error);
      handleError(error, "take picture");
    }
  }, [handleError]);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setCapturedImage(asset.uri);
        
        // Process and analyze image
        await analyzeImage(asset.uri);
      }
    } catch (error) {
      console.error("💥 Image picker error:", error);
      handleError(error, "pick image");
    }
  }, [handleError]);

  const analyzeImage = useCallback(async (imageUri: string) => {
    try {
      setRetryCount(0);
      console.log("🔄 Processing image for analysis...");
      
      // Process image to base64
      const base64 = await processImage(imageUri);
      
      // Dispatch analysis
      await dispatch(analyzeMeal({
        imageBase64: base64,
        language: isRTL ? "hebrew" : "english",
      })).unwrap();

      setShowAnalysis(true);
      console.log("✅ Image analysis completed");
    } catch (error) {
      console.error("💥 Analysis error:", error);
      setRetryCount(prev => prev + 1);
      
      if (retryCount < 2) {
        Alert.alert(
          t("camera.analysis_failed"),
          "Would you like to try again?",
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.retry"), onPress: () => analyzeImage(imageUri) },
          ]
        );
      } else {
        handleError(error, "analyze image");
      }
    }
  }, [dispatch, isRTL, t, retryCount, handleError]);

  const handleSaveMeal = useCallback(async () => {
    if (!pendingMeal) return;

    try {
      await dispatch(postMeal()).unwrap();
      handleSuccess(t("camera.save_success"));
      
      // Reset state
      setCapturedImage(null);
      setShowAnalysis(false);
      dispatch(clearPendingMeal());
      
      // Navigate to home
      router.replace("/(tabs)");
    } catch (error) {
      console.error("💥 Save meal error:", error);
      handleError(error, "save meal");
    }
  }, [pendingMeal, dispatch, handleSuccess, handleError, t]);

  const handleUpdateAnalysis = useCallback(async () => {
    if (!editText.trim() || !pendingMeal) return;

    try {
      await dispatch(updateMeal({
        meal_id: pendingMeal.meal_id || "",
        updateText: editText.trim(),
      })).unwrap();

      setShowEditModal(false);
      setEditText("");
      handleSuccess(t("camera.update_success"));
    } catch (error) {
      console.error("💥 Update analysis error:", error);
      handleError(error, "update analysis");
    }
  }, [editText, pendingMeal, dispatch, handleSuccess, handleError, t]);

  const handleRetakePhoto = useCallback(() => {
    setCapturedImage(null);
    setShowAnalysis(false);
    dispatch(clearPendingMeal());
    setShowCamera(true);
  }, [dispatch]);

  const handleDiscardAnalysis = useCallback(() => {
    Alert.alert(
      t("camera.delete_analysis"),
      t("camera.delete_confirmation"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            setCapturedImage(null);
            setShowAnalysis(false);
            dispatch(clearPendingMeal());
          },
        },
      ]
    );
  }, [dispatch, t]);

  // Permission check
  if (!permission) {
    return <LoadingSpinner text="Loading camera..." />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>{t("camera.permission")}</Text>
        <Text style={styles.permissionMessage}>
          {t("camera.description")}
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Analysis view
  if (showAnalysis && pendingMeal) {
    return (
      <ErrorBoundary>
        <SafeAreaView style={styles.container}>
          <ScrollView style={styles.analysisContainer}>
            {/* Header */}
            <View style={styles.analysisHeader}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleDiscardAnalysis}
              >
                <X size={24} color="#ef4444" />
              </TouchableOpacity>
              
              <Text style={styles.analysisTitle}>
                {t("camera.analysis_results")}
              </Text>
              
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setShowEditModal(true)}
              >
                <Edit3 size={24} color="#3b82f6" />
              </TouchableOpacity>
            </View>

            {/* Image */}
            {capturedImage && (
              <View style={styles.imageContainer}>
                <OptimizedImage
                  source={{ uri: capturedImage }}
                  style={styles.analysisImage}
                  showLoader={true}
                />
              </View>
            )}

            {/* Analysis Results */}
            {pendingMeal.analysis && (
              <View style={styles.resultsContainer}>
                <View style={styles.mealNameContainer}>
                  <Text style={styles.mealName}>
                    {pendingMeal.analysis.meal_name || pendingMeal.analysis.name}
                  </Text>
                  {pendingMeal.analysis.description && (
                    <Text style={styles.mealDescription}>
                      {pendingMeal.analysis.description}
                    </Text>
                  )}
                </View>

                {/* Nutrition Info */}
                <View style={styles.nutritionContainer}>
                  <Text style={styles.sectionTitle}>
                    {t("camera.nutritional_info")}
                  </Text>
                  
                  <View style={styles.nutritionGrid}>
                    {[
                      {
                        label: t("meals.calories"),
                        value: Math.round(pendingMeal.analysis.calories || 0),
                        unit: t("meals.kcal"),
                        color: "#ef4444",
                      },
                      {
                        label: t("meals.protein"),
                        value: Math.round(pendingMeal.analysis.protein_g || pendingMeal.analysis.protein || 0),
                        unit: "g",
                        color: "#10b981",
                      },
                      {
                        label: t("meals.carbs"),
                        value: Math.round(pendingMeal.analysis.carbs_g || pendingMeal.analysis.carbs || 0),
                        unit: "g",
                        color: "#f59e0b",
                      },
                      {
                        label: t("meals.fat"),
                        value: Math.round(pendingMeal.analysis.fats_g || pendingMeal.analysis.fat || 0),
                        unit: "g",
                        color: "#8b5cf6",
                      },
                    ].map((item, index) => (
                      <View key={index} style={styles.nutritionCard}>
                        <Text style={[styles.nutritionValue, { color: item.color }]}>
                          {item.value}
                        </Text>
                        <Text style={styles.nutritionUnit}>{item.unit}</Text>
                        <Text style={styles.nutritionLabel}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Ingredients */}
                {pendingMeal.analysis.ingredients && pendingMeal.analysis.ingredients.length > 0 && (
                  <View style={styles.ingredientsContainer}>
                    <Text style={styles.sectionTitle}>
                      {t("camera.identified_ingredients")}
                    </Text>
                    <View style={styles.ingredientsList}>
                      {pendingMeal.analysis.ingredients.map((ingredient: any, index: number) => (
                        <View key={index} style={styles.ingredientChip}>
                          <Text style={styles.ingredientText}>
                            {ingredient.name || `Ingredient ${index + 1}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.retakeButton]}
                onPress={handleRetakePhoto}
                disabled={isPosting}
              >
                <Camera size={20} color="#6b7280" />
                <Text style={styles.retakeButtonText}>
                  {t("camera.retake_photo")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={handleSaveMeal}
                disabled={isPosting || !pendingMeal.analysis}
              >
                {isPosting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Save size={20} color="#ffffff" />
                    <Text style={styles.saveButtonText}>
                      {t("camera.save_meal")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Edit Modal */}
          <Modal
            visible={showEditModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowEditModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.editModalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {t("camera.edit_analysis")}
                  </Text>
                  <TouchableOpacity onPress={() => setShowEditModal(false)}>
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.editInput}
                  value={editText}
                  onChangeText={setEditText}
                  placeholder={t("camera.add_correction")}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => setShowEditModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>
                      {t("common.cancel")}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.updateButton,
                      !editText.trim() && styles.disabledButton,
                    ]}
                    onPress={handleUpdateAnalysis}
                    disabled={!editText.trim() || isUpdating}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.updateButtonText}>
                        {t("camera.update_analysis")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </ErrorBoundary>
    );
  }

  // Camera view
  if (showCamera) {
    return (
      <ErrorBoundary>
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            flash={flash ? "on" : "off"}
          >
            {/* Camera overlay */}
            <View style={styles.cameraOverlay}>
              {/* Top controls */}
              <View style={styles.topControls}>
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => setShowCamera(false)}
                >
                  <X size={24} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => setFlash(!flash)}
                >
                  {flash ? (
                    <Flash size={24} color="#ffffff" />
                  ) : (
                    <FlashOff size={24} color="#ffffff" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Center guide */}
              <View style={styles.centerGuide}>
                <View style={styles.guideBorder} />
                <Text style={styles.guideText}>
                  {t("camera.tip_description")}
                </Text>
              </View>

              {/* Bottom controls */}
              <View style={styles.bottomControls}>
                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={pickImage}
                >
                  <ImageIcon size={24} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={takePicture}
                >
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.flipButton}
                  onPress={() => setFacing(facing === "back" ? "front" : "back")}
                >
                  <FlipHorizontal size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          </CameraView>

          {/* Loading overlay */}
          {isAnalyzing && (
            <View style={styles.loadingOverlay}>
              <LoadingSpinner
                text={t("camera.analyzing_title")}
                overlay={true}
              />
            </View>
          )}
        </View>
      </ErrorBoundary>
    );
  }

  // Main screen
  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={["#10b981", "#059669"]}
          style={styles.header}
        >
          <Text style={styles.headerTitle}>{t("camera.title")}</Text>
          <Text style={styles.headerSubtitle}>
            {t("camera.analysis_subtitle")}
          </Text>
        </LinearGradient>

        <View style={styles.content}>
          {/* Tips section */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>{t("camera.optimal_results")}</Text>
            <Text style={styles.tipsText}>{t("camera.tip_description")}</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={styles.primaryActionButton}
              onPress={() => setShowCamera(true)}
            >
              <LinearGradient
                colors={["#10b981", "#059669"]}
                style={styles.actionButtonGradient}
              >
                <Camera size={24} color="#ffffff" />
                <Text style={styles.primaryActionText}>
                  {t("camera.take_picture")}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryActionButton}
              onPress={pickImage}
            >
              <ImageIcon size={24} color="#10b981" />
              <Text style={styles.secondaryActionText}>
                {t("camera.choose_gallery")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error display */}
          {mealError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{mealError}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  if (capturedImage) {
                    analyzeImage(capturedImage);
                  }
                }}
              >
                <RefreshCw size={16} color="#10b981" />
                <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
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
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  tipsContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  actionButtonsContainer: {
    gap: 16,
  },
  primaryActionButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  actionButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 12,
  },
  primaryActionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  secondaryActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 20,
    gap: 12,
    borderWidth: 2,
    borderColor: "#10b981",
  },
  secondaryActionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#10b981",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f8fafc",
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 16,
    textAlign: "center",
  },
  permissionMessage: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  permissionButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  topControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  centerGuide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  guideBorder: {
    width: width - 80,
    height: (width - 80) * 0.75,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 16,
    borderStyle: "dashed",
    marginBottom: 20,
  },
  guideText: {
    fontSize: 16,
    color: "#ffffff",
    textAlign: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bottomControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  galleryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#ffffff",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ffffff",
  },
  flipButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  analysisContainer: {
    flex: 1,
  },
  analysisHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  analysisTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1f2937",
  },
  imageContainer: {
    margin: 20,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  analysisImage: {
    width: "100%",
    height: 200,
  },
  resultsContainer: {
    padding: 20,
    gap: 24,
  },
  mealNameContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mealName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
  },
  mealDescription: {
    fontSize: 16,
    color: "#6b7280",
    lineHeight: 24,
  },
  nutritionContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 16,
  },
  nutritionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  nutritionCard: {
    flex: 1,
    minWidth: (width - 80) / 2 - 6,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  nutritionValue: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  nutritionUnit: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  ingredientsContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ingredientsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ingredientChip: {
    backgroundColor: "#f0fdf4",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  ingredientText: {
    fontSize: 12,
    color: "#065f46",
    fontWeight: "500",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  retakeButton: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#d1d5db",
  },
  saveButton: {
    backgroundColor: "#10b981",
  },
  retakeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  editModalContent: {
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
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#374151",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 20,
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
  updateButton: {
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
  updateButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#ef4444",
  },
  errorText: {
    fontSize: 14,
    color: "#ef4444",
    marginBottom: 12,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  retryButtonText: {
    fontSize: 14,
    color: "#10b981",
    fontWeight: "500",
  },
});