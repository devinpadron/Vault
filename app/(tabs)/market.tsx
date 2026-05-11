import { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
} from 'react-native-reanimated';
import { CardThumb } from '@/components/cards/CardThumb';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { useListings, useLiveLot } from '@/lib/api/market';
import { useFriends } from '@/lib/api/friends';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { Listing, cardBaseName, cardNameVariant } from '@/types';

type SubView = 'listings' | 'live';

const SORT_OPTIONS = ['Trending', 'Lowest price', 'Ending soon', 'PSA Graded'];

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function MarketScreen() {
  const insets = useSafeAreaInsets();
  const [subView, setSubView] = useState<SubView>('listings');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>22,418 active</Text>
        <Text style={styles.title}>
          <Text style={styles.titleAccent}>Market</Text>
        </Text>
      </View>

      {/* Segmented control */}
      <View style={styles.segmentRow}>
        {(['listings', 'live'] as SubView[]).map(v => (
          <TouchableOpacity
            key={v}
            style={[styles.segment, subView === v && styles.segmentActive]}
            onPress={() => setSubView(v)}
          >
            {v === 'live' && <View style={styles.liveIndicatorDot} />}
            <Text style={[styles.segmentText, subView === v && styles.segmentTextActive]}>
              {v === 'listings' ? 'Listings' : 'Live'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {subView === 'listings' ? <Listings /> : <Live />}
    </ScrollView>
  );
}

// ─── Listings ────────────────────────────────────────────────────────────────

function Listings() {
  const [sort, setSort] = useState(SORT_OPTIONS[0]);
  const { data: listings = [], isError, refetch } = useListings(sort);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}
        style={styles.sortScroll}
      >
        {SORT_OPTIONS.map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.sortPill, sort === s && styles.sortPillActive]}
            onPress={() => setSort(s)}
          >
            <Text style={[styles.sortPillText, sort === s && styles.sortPillTextActive]}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isError && <ErrorPanel message="Failed to load listings" onRetry={refetch} />}
      <View style={styles.listingList}>
        {listings.map((listing: Listing, index: number) => (
          <ListingRow key={listing.id} listing={listing} index={index} />
        ))}
      </View>
    </View>
  );
}

function ListingRow({ listing, index }: { listing: Listing; index: number }) {
  const isPSA = listing.condition.startsWith('PSA');

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <TouchableOpacity
        style={styles.listingRow}
        onPress={() => router.push(`/card/${listing.card.id}`)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`View ${listing.card.name} listing`}
      >
        <CardThumb card={listing.card} width={64} />

        <View style={styles.listingInfo}>
          <Text style={styles.listingName}>
            {cardBaseName(listing.card.name)}
            {cardNameVariant(listing.card.name) && (
              <Text style={styles.listingVariant}> {cardNameVariant(listing.card.name)}</Text>
            )}
          </Text>
          <Text style={styles.listingSet}>
            {listing.card.set} · {listing.card.no}
          </Text>
          <View style={styles.badgeRow}>
            <View style={[styles.conditionBadge, isPSA && styles.conditionBadgePSA]}>
              <Text style={[styles.conditionText, isPSA && styles.conditionTextPSA]}>
                {listing.condition}
              </Text>
            </View>
            <Text style={styles.sellerHandle}>· @{listing.seller}</Text>
            <View style={styles.starRow}>
              <Icon name="star" size={9} color={Colors.gold} />
              <Text style={styles.sellerScore}>{listing.seller_score}</Text>
            </View>
          </View>
        </View>

        <View style={styles.listingRight}>
          <Text style={styles.listingAge}>{listing.listed} ago</Text>
          <View>
            <Text style={styles.listingPrice}>${fmt(listing.price)}</Text>
            <Text style={styles.buyNow}>BUY NOW</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Live ─────────────────────────────────────────────────────────────────────

const CHAT_COMMENTS = [
  { user: '@cardpriest', msg: 'foil quality 🔥' },
  { user: '@theo.lin',   msg: 'PSA 10 incoming' },
  { user: '@mira_h',     msg: 'fairly priced tbh' },
];

function Live() {
  const { data: card } = useLiveLot();
  const { data: friends = [] } = useFriends();
  const [bid, setBid] = useState(2840);
  const [bidders, setBidders] = useState(34);
  const [seconds, setSeconds] = useState(42);

  // Simulate live bids ticking
  useEffect(() => {
    const tick = setInterval(() => {
      setBid(b => b + Math.floor(Math.random() * 25) + 5);
      setBidders(b => b + (Math.random() > 0.7 ? 1 : 0));
    }, 2400);
    return () => clearInterval(tick);
  }, []);

  // Countdown
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const countdown = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  // Bid number scale-pop on change
  const bidScale = useSharedValue(1);
  useEffect(() => {
    bidScale.value = withSequence(
      withTiming(1.1, { duration: 110 }),
      withSpring(1, { damping: 10, stiffness: 220 }),
    );
  // bidScale is a ref — intentionally excluded from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bid]);
  const bidAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bidScale.value }],
  }));

  // Pulsing LIVE dot
  const dotOpacity = useSharedValue(1);
  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false,
    );
  }, []);
  const dotAnimStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  // Pulsing bid button
  const btnOpacity = useSharedValue(1);
  useEffect(() => {
    btnOpacity.value = withRepeat(
      withSequence(withTiming(0.72, { duration: 900 }), withTiming(1, { duration: 900 })),
      -1,
      false,
    );
  }, []);
  const btnAnimStyle = useAnimatedStyle(() => ({ opacity: btnOpacity.value }));

  return (
    <View>
      {/* Video tile */}
      <View style={styles.videoTile}>
        <LinearGradient
          colors={['#2a1f3a', '#0a0a14']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {card && <CardThumb card={card} width={150} />}

        {/* LIVE badge */}
        <View style={styles.liveBadge}>
          <Animated.View style={[styles.liveBadgeDot, dotAnimStyle]} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>

        {/* Viewer count */}
        <View style={styles.viewerPill}>
          <Icon name="eye" size={10} color={Colors.text} />
          <Text style={styles.viewerText}>{Math.floor(bidders * 8.4)}</Text>
        </View>

        {/* Chat strip */}
        <View style={styles.chatStrip}>
          {CHAT_COMMENTS.map((c, i) => (
            <View key={i} style={[styles.chatBubble, { opacity: 1 - i * 0.25 }]}>
              <Text style={styles.chatUser}>{c.user}</Text>
              <Text style={styles.chatMsg}> {c.msg}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Current lot panel */}
      <View style={styles.lotPanel}>
        <Text style={styles.lotEyebrow}>Current lot · 04 of 12</Text>
        <Text style={styles.lotCardName}>
          {card ? cardBaseName(card.name) : '—'}
          {card && cardNameVariant(card.name) && (
            <Text style={styles.lotCardVariant}> {cardNameVariant(card.name)}</Text>
          )}
        </Text>

        <View style={styles.bidRow}>
          <View>
            <Text style={styles.highBidLabel}>HIGH BID</Text>
            <Animated.View style={[styles.bidAmountRow, bidAnimStyle]}>
              <Text style={styles.bidDollar}>$</Text>
              <Text style={styles.bidAmount}>{fmt(bid)}</Text>
            </Animated.View>
          </View>
          <View style={styles.endsBlock}>
            <Text style={styles.endsLabel}>ENDS</Text>
            <Text style={[styles.endsCountdown, seconds <= 10 && { color: Colors.down }]}>
              {countdown}
            </Text>
          </View>
        </View>

        <View style={styles.biddersRow}>
          <View style={styles.avatarStack}>
            {friends.slice(0, 3).map((f, i) => (
              <View
                key={f.id}
                style={[styles.avatarBorder, { marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }]}
              >
                <Avatar colors={f.avatar} size={20} />
              </View>
            ))}
          </View>
          <Text style={styles.biddersText}>{bidders} BIDDERS</Text>
        </View>
      </View>

      {/* CTAs */}
      <View style={styles.bidCtaRow}>
        <TouchableOpacity style={styles.watchBtn}>
          <Text style={styles.watchText}>Watch</Text>
        </TouchableOpacity>
        <Animated.View style={[styles.placeBidWrapper, btnAnimStyle]}>
          <TouchableOpacity style={styles.placeBidBtn}>
            <Text style={styles.placeBidText}>Place bid · ${fmt(bid + 25)}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: Spacing.xl,
  },

  // Header
  header: {
    marginBottom: 18,
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
    fontSize: 38,
    color: Colors.text,
    lineHeight: 40,
  },
  titleAccent: {
    fontFamily: FontFamily.displayItalic,
    color: Colors.gold,
  },

  // Segmented control
  segmentRow: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 18,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.sm,
  },
  segmentActive: {
    backgroundColor: Colors.elevated,
  },
  segmentText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.text3,
  },
  segmentTextActive: {
    color: Colors.text,
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.down,
  },

  // Sort pills
  sortScroll: {
    marginHorizontal: -Spacing.xl,
    marginBottom: 14,
  },
  sortRow: {
    paddingHorizontal: Spacing.xl,
    gap: 8,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sortPillActive: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderColor: 'rgba(255,215,0,0.3)',
  },
  sortPillText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text2,
  },
  sortPillTextActive: {
    color: Colors.gold,
  },

  // Listing list
  listingList: {
    gap: 12,
  },
  listingRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 14,
  },
  listingInfo: {
    flex: 1,
    minWidth: 0,
  },
  listingName: {
    fontFamily: FontFamily.display,
    fontSize: 16,
    color: Colors.text,
  },
  listingVariant: {
    fontFamily: FontFamily.display,
    fontSize: 13,
    color: Colors.text2,
  },
  listingSet: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1,
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  conditionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  conditionBadgePSA: {
    backgroundColor: 'rgba(255,215,0,0.12)',
  },
  conditionText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text2,
    letterSpacing: 1,
  },
  conditionTextPSA: {
    color: Colors.gold,
  },
  sellerHandle: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Colors.text3,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sellerScore: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text2,
  },
  listingRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  listingAge: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
  },
  listingPrice: {
    fontFamily: FontFamily.mono,
    fontSize: 18,
    color: Colors.text,
    letterSpacing: -0.4,
    textAlign: 'right',
  },
  buyNow: {
    fontFamily: FontFamily.mono,
    fontSize: 8,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 2,
    textAlign: 'right',
  },

  // Video tile
  videoTile: {
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'hidden',
    aspectRatio: 4 / 3,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: '#FF3B3B',
  },
  liveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    fontFamily: FontFamily.monoMed,
    fontSize: 10,
    color: '#fff',
    letterSpacing: 1.6,
  },
  viewerPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  viewerText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text,
    letterSpacing: 1,
  },
  chatStrip: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 4,
  },
  chatBubble: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
    maxWidth: '90%',
  },
  chatUser: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 11,
    color: Colors.gold,
  },
  chatMsg: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Colors.text,
  },

  // Current lot panel
  lotPanel: {
    marginBottom: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  lotEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  lotCardName: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
  },
  lotCardVariant: {
    fontFamily: FontFamily.displayItalic,
    fontSize: 22,
    color: Colors.gold,
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  highBidLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bidAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
  },
  bidDollar: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    color: Colors.text,
  },
  bidAmount: {
    fontFamily: FontFamily.mono,
    fontSize: 28,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  endsBlock: {
    alignItems: 'flex-end',
  },
  endsLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  endsCountdown: {
    fontFamily: FontFamily.mono,
    fontSize: 16,
    color: Colors.down,
  },
  biddersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBorder: {
    padding: 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
  },
  biddersText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text2,
  },

  // Bid CTAs
  bidCtaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  watchBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 13,
    color: Colors.text,
  },
  placeBidWrapper: {
    flex: 1,
  },
  placeBidBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeBidText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: '#0A0A0C',
  },
});
