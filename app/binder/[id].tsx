import { useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumb } from '@/components/cards/CardThumb';
import { Icon } from '@/components/ui/Icon';
import { useBinder, useBinderCards } from '@/lib/api/binders';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/types';

const CONTAINER_MARGIN = 18;
const CONTAINER_PADDING = 14;
const COL_GAP = 10;
const SLEEVE_PADDING = 4;
const NUM_COLS = 3;
const NUM_PAGES = 5;

function getThumbWidth(screenWidth: number) {
  const inner = screenWidth - CONTAINER_MARGIN * 2 - CONTAINER_PADDING * 2;
  const sleeveWidth = (inner - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;
  return Math.floor(sleeveWidth - SLEEVE_PADDING * 2);
}

export default function BinderOpenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activePage, setActivePage] = useState(0);
  const insets = useSafeAreaInsets();

  const { data: binder } = useBinder(id ?? '');
  const { data: binderCards = [] } = useBinderCards(id ?? '');
  if (!binder) return null;

  const { width: screenWidth } = Dimensions.get('window');
  const thumbWidth = getThumbWidth(screenWidth);

  const sleeveCards = binderCards.slice(0, 9);
  const paddedCards: (Card | null)[] = [
    ...sleeveCards,
    ...Array(Math.max(0, 9 - sleeveCards.length)).fill(null),
  ];
  const rows = [paddedCards.slice(0, 3), paddedCards.slice(3, 6), paddedCards.slice(6, 9)];

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Sticky nav header */}
        <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
            <Icon name="chevron-left" size={18} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.navActions}>
            <TouchableOpacity style={styles.navBtn}>
              <Icon name="send" size={18} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn}>
              <Icon name="menu" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.eyebrow}>{binder.subtitle || `${binder.count} CARDS`}</Text>
          <Text style={styles.title}>{binder.name}</Text>
        </View>

        {/* Sleeve grid */}
        <View style={[styles.sleeveContainer, { marginHorizontal: CONTAINER_MARGIN }]}>
          <LinearGradient
            colors={binder.tone}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {binderCards.length === 0 ? (
            <View style={styles.emptyGrid}>
              <Text style={styles.emptyTitle}>No cards yet</Text>
              <Text style={styles.emptySubtitle}>Add cards to your collection</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {rows.map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.gridRow, rowIndex < rows.length - 1 && { marginBottom: COL_GAP }]}>
                  {row.map((card, colIndex) => (
                    <View key={colIndex} style={[styles.sleeve, { width: thumbWidth + SLEEVE_PADDING * 2 }]}>
                      {card ? (
                        <CardThumb card={card} width={thumbWidth} />
                      ) : (
                        <View style={{ width: thumbWidth, height: Math.floor(thumbWidth * 1.4), backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 4 }} />
                      )}
                      <LinearGradient
                        colors={[
                          'rgba(255,255,255,0.18)',
                          'transparent',
                          'transparent',
                          'rgba(255,255,255,0.08)',
                        ]}
                        locations={[0, 0.3, 0.7, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: Radius.sm }]}
                        pointerEvents="none"
                      />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Pagination dots */}
          <View style={styles.dotsRow}>
            {Array.from({ length: NUM_PAGES }).map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setActivePage(i)}
                style={[styles.dot, i === activePage && styles.dotActive]}
              />
            ))}
          </View>
        </View>

        {/* CTAs */}
        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.ctaPrimary}>
            <Text style={styles.ctaPrimaryText}>Share binder</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctaIcon}>
            <Icon name="plus" size={16} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 0,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
  },
  navActions: {
    flexDirection: 'row',
    gap: 8,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  titleSection: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 22,
  },
  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 4,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    color: Colors.text,
    lineHeight: 34,
  },
  sleeveContainer: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    padding: CONTAINER_PADDING,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  emptyGrid: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  grid: {
    flexDirection: 'column',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sleeve: {
    padding: SLEEVE_PADDING,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: 14,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    width: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: Spacing.xl,
    marginTop: 24,
  },
  ctaPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
  ctaIcon: {
    width: 50,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
