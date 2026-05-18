import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontFamily, Radius } from '@/constants/theme';

interface Props {
  message?: string;
  /** When provided in dev mode, the underlying error message is shown
      below the user-facing message — useful for schema-drift bugs. */
  error?: unknown;
  onRetry?: () => void;
}

function extractErrorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return null;
}

export function ErrorPanel({ message = 'Something went wrong', error, onRetry }: Props) {
  const detail = __DEV__ ? extractErrorMessage(error) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {detail && <Text style={styles.detail}>{detail}</Text>}
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
    gap: 10,
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
  },
  detail: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.down,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 14,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginTop: 4,
  },
  btnText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.text2,
  },
});
