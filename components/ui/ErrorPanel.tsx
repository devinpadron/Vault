import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontFamily, Radius } from '@/constants/theme';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export function ErrorPanel({ message = 'Something went wrong', onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.btn} onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry">
          <Text style={styles.btnText}>RETRY</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 14,
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btnText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.text2,
  },
});
