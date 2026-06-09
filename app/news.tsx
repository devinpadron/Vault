import { FlatList, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { useNews } from '@/lib/api/news';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { NewsItem } from '@/types';

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const { data: news = [], isLoading, isError, refetch } = useNews();

  return (
    <View style={styles.root}>
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
          <Icon name="chevron-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>The Brief</Text>
        <View style={styles.navBtn} />
      </View>

      {isError ? (
        <View style={styles.centerFill}>
          <ErrorPanel message="Failed to load news" onRetry={refetch} />
        </View>
      ) : (
        <FlatList
          data={isLoading ? [] : news}
          keyExtractor={item => item.id}
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            isLoading ? (
              <View style={{ gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
              </View>
            ) : (
              <Text style={styles.eyebrow}>{news.length} articles · last 30 days</Text>
            )
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No news yet — check back soon.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <NewsRow item={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const onPress = () => {
    if (item.url) Linking.openURL(item.url).catch(() => {});
  };
  return (
    <TouchableOpacity
      style={styles.newsItem}
      onPress={onPress}
      activeOpacity={item.url ? 0.85 : 1}
      accessibilityRole={item.url ? 'link' : undefined}
      accessibilityLabel={item.title}
    >
      <View style={styles.newsArt}>
        <LinearGradient
          colors={item.art}
          locations={[0, 0.5, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={['rgba(255,255,255,0.4)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
      <View style={styles.newsMeta}>
        <View style={styles.newsTagRow}>
          <Text style={styles.newsTag}>{item.tag}</Text>
          <View style={styles.dot} />
          <Text style={styles.when}>{item.when}</Text>
        </View>
        <Text style={styles.newsTitle} numberOfLines={3}>{item.title}</Text>
        <Text style={styles.minutes}>{item.minutes} MIN READ</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  screen: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl, paddingTop: 4 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 14,
  },
  navTitle: { fontFamily: FontFamily.display, fontSize: 22, color: Colors.text },
  navBtn: {
    width: 38, height: 38,
    borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 12,
  },

  newsItem: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  newsArt: {
    width: 56, height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  newsMeta: { flex: 1, minWidth: 0 },
  newsTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  newsTag: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: Colors.gold,
  },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.text3 },
  when: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1,
  },
  newsTitle: {
    fontFamily: FontFamily.display,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 19,
  },
  minutes: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    marginTop: 6,
    letterSpacing: 1,
  },

  separator: { height: 1, backgroundColor: Colors.line },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text3 },
});
