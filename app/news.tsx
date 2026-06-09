import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon } from '@/components/ui/Icon';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { NewsRow } from '@/components/news/NewsRow';
import { useNews } from '@/lib/api/news';
import { Colors, FontFamily, NavButtonStyle, Spacing } from '@/constants/theme';

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
  navBtn: NavButtonStyle,

  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 12,
  },

  separator: { height: 1, backgroundColor: Colors.line },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.text3 },
});
