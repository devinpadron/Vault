import { useState, useEffect } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  Easing,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { Card3D } from '@/components/cards/Card3D';
import { Icon } from '@/components/ui/Icon';
import { MOCK_DATA } from '@/data/mock';
import { Colors, FontFamily, Radius } from '@/constants/theme';

type Phase = 'scanning' | 'identified';

const RETICLE_W = 240;
const RETICLE_H = 336;
const IDENTIFIED_CARD = MOCK_DATA.cards[0]; // Emberwyrm EX

const PARTICLE_CONFIGS = Array.from({ length: 14 }, (_, i) => ({
  angle: (i / 14) * Math.PI * 2,
  distance: 70 + (i % 3) * 28,
  color: [
    Colors.gold, '#FF7A3A', '#5FD2FF', '#9CFF6E', '#FF5FB6',
    '#7A6BFF', '#FFB8E0', '#FF5C5C', '#4ADE80', '#FFE03A',
    '#C9A700', '#2A6BC9', '#C06AAF', '#FF7AE0',
  ][i],
}));

function Particle({
  angle, distance, color, progress,
}: {
  angle: number;
  distance: number;
  color: string;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35,
      transform: [
        { translateX: Math.cos(angle) * distance * p },
        { translateY: Math.sin(angle) * distance * p },
      ],
    };
  });
  return <Animated.View style={[styles.particle, { backgroundColor: color }, style]} />;
}

function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(2);
}

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [scanCount, setScanCount] = useState(0);

  const beamY = useSharedValue(0);
  const particleProgress = useSharedValue(0);
  const cardY = useSharedValue(60);
  const cardOpacity = useSharedValue(0);

  // Beam animation runs during scanning phase
  useEffect(() => {
    if (phase === 'scanning') {
      beamY.value = 0;
      beamY.value = withRepeat(
        withTiming(RETICLE_H, { duration: 1800, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(beamY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Auto-transition to identified after 2.4s; re-runs on rescan
  useEffect(() => {
    particleProgress.value = 0;
    cardY.value = 60;
    cardOpacity.value = 0;

    const t = setTimeout(() => {
      setPhase('identified');
      particleProgress.value = withTiming(1, {
        duration: 700,
        easing: Easing.out(Easing.quad),
      });
      cardY.value = withSpring(0, { damping: 16, stiffness: 100 });
      cardOpacity.value = withTiming(1, { duration: 500 });
    }, 2400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanCount]);

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: beamY.value }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardY.value }],
    opacity: cardOpacity.value,
  }));

  const handleRescan = () => {
    setPhase('scanning');
    setScanCount(c => c + 1);
  };

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.back()}
          accessibilityLabel="Close scanner"
          accessibilityRole="button"
        >
          <Icon name="close" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>
            {phase === 'scanning' ? 'SCAN MODE' : 'IDENTIFIED'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          accessibilityLabel="Toggle flash"
          accessibilityRole="button"
        >
          <Icon name="flash" size={16} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Center */}
      <View style={styles.center}>
        {phase === 'scanning' ? (
          <View style={styles.reticle}>
            {/* Corner brackets */}
            {[
              { top: 0,    left: 0,  borderTopWidth: 2,    borderLeftWidth: 2  },
              { top: 0,    right: 0, borderTopWidth: 2,    borderRightWidth: 2 },
              { bottom: 0, left: 0,  borderBottomWidth: 2, borderLeftWidth: 2  },
              { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
            ].map((pos, i) => (
              <View key={i} style={[styles.corner, pos, { borderColor: Colors.gold }]} />
            ))}
            {/* Sweep beam */}
            <Animated.View style={[styles.beam, beamStyle]} />
          </View>
        ) : (
          <View style={styles.identifiedCenter}>
            {/* Particle burst — all particles originate from center */}
            <View style={styles.particleHub}>
              {PARTICLE_CONFIGS.map((p, i) => (
                <Particle key={i} {...p} progress={particleProgress} />
              ))}
            </View>
            {/* Card materializes */}
            <Animated.View style={cardStyle}>
              <Card3D
                card={IDENTIFIED_CARD}
                width={Math.round(RETICLE_W * 0.72)}
                onPress={() => router.push(`/card/${IDENTIFIED_CARD.id}`)}
              />
            </Animated.View>
          </View>
        )}
      </View>

      {/* Bottom */}
      {phase === 'scanning' ? (
        <View style={[styles.scanBottom, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.analyzeLabel}>● ANALYZING</Text>
          <Text style={styles.hint}>Hold steady — frame the card</Text>
          <Text style={styles.subLabel}>IMAGE HASH · SET LOOKUP · PRICE FETCH</Text>
        </View>
      ) : (
        <Animated.View
          entering={require('react-native-reanimated').FadeInUp.duration(350)}
          style={[styles.resultSheet, { paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.resultGrabber} />
          <Text style={styles.confidence}>97.4% · MATCH</Text>
          <View style={styles.resultMeta}>
            <Text style={styles.resultName}>
              {IDENTIFIED_CARD.name}{' '}
              <Text style={styles.resultVariant}>{IDENTIFIED_CARD.variant}</Text>
            </Text>
            <Text style={styles.resultSet}>
              {IDENTIFIED_CARD.set} · {IDENTIFIED_CARD.no}
            </Text>
          </View>
          <Text style={styles.resultPrice}>${fmt(IDENTIFIED_CARD.value)}</Text>
          <View style={styles.resultCtaRow}>
            <TouchableOpacity
              style={styles.rescanBtn}
              onPress={handleRescan}
              accessibilityLabel="Rescan card"
              accessibilityRole="button"
            >
              <Text style={styles.rescanText}>Rescan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.back()}
              accessibilityLabel="Add card to collection"
              accessibilityRole="button"
            >
              <Text style={styles.addBtnText}>Add to collection</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050507',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modeBadgeText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: Colors.text,
  },
  // Center
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Scanning reticle
  reticle: {
    width: RETICLE_W,
    height: RETICLE_H,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
  },
  beam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    backgroundColor: Colors.gold,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 4,
  },
  // Identified
  identifiedCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  particleHub: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Scan bottom
  scanBottom: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  analyzeLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.gold,
    marginBottom: 8,
  },
  hint: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
    textAlign: 'center',
  },
  subLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text3,
    marginTop: 8,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  // Result sheet
  resultSheet: {
    backgroundColor: Colors.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  resultGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.line,
    alignSelf: 'center',
    marginBottom: 14,
  },
  confidence: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.up,
    marginBottom: 6,
  },
  resultMeta: {
    marginBottom: 12,
  },
  resultName: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    color: Colors.text,
    lineHeight: 32,
  },
  resultVariant: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 28,
    color: Colors.gold,
  },
  resultSet: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.4,
    marginTop: 3,
  },
  resultPrice: {
    fontFamily: FontFamily.mono,
    fontSize: 24,
    color: Colors.text,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  resultCtaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rescanBtn: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rescanText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 13,
    color: Colors.text,
  },
  addBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
});
