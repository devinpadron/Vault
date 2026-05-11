import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth/AuthContext';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  const { login } = useAuth();

  async function signInWith(provider: 'apple' | 'google') {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    await login('mock-token-' + id, {
      id,
      name: 'Trainer',
      handle: '@trainer',
      email: `${provider}@mock.com`,
      avatar: ['#FFD700', '#FF7A3A'],
    });
    router.replace('/(tabs)');
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(255,215,0,0.06)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.logo}>THE VAULT</Text>
          <Text style={styles.tagline}>Your collection. Your vault.</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.appleBtn}
            onPress={() => signInWith('apple')}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-apple" size={20} color="#000" />
            <Text style={styles.appleBtnText}>Continue with Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={() => signInWith('google')}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-google" size={18} color={Colors.text} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: '35%',
    paddingBottom: 48,
  },
  hero: {
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    fontFamily: FontFamily.display,
    fontSize: 48,
    color: Colors.gold,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    color: Colors.text2,
  },
  actions: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  appleBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: Radius.md,
    backgroundColor: '#fff',
  },
  appleBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 15,
    color: '#000',
  },
  googleBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  googleBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 15,
    color: Colors.text,
  },
  legal: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
});
