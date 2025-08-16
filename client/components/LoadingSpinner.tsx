import React from "react";
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { useTheme } from "@/src/context/ThemeContext";

interface LoadingSpinnerProps {
  size?: "small" | "large";
  text?: string;
  overlay?: boolean;
  color?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "large",
  text,
  overlay = false,
  color,
}) => {
  const { colors } = useTheme();
  const spinValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const spin = () => {
      spinValue.setValue(0);
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => spin());
    };
    spin();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const containerStyle = overlay
    ? [styles.overlay, { backgroundColor: colors.background + "CC" }]
    : styles.container;

  return (
    <View style={containerStyle}>
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.spinnerContainer,
            { transform: [{ rotate: spin }] },
          ]}
        >
          <ActivityIndicator
            size={size}
            color={color || colors.primary}
            style={styles.spinner}
          />
        </Animated.View>
        
        {text && (
          <Text style={[styles.text, { color: colors.text }]}>
            {text}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  content: {
    alignItems: "center",
    gap: 16,
  },
  spinnerContainer: {
    padding: 20,
  },
  spinner: {
    transform: [{ scale: 1.2 }],
  },
  text: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 8,
  },
});

export default LoadingSpinner;