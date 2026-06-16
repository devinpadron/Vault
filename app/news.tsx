import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorPanel } from '@/components/ui/ErrorPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SkeletonRow } from '@/components/ui/SkeletonRow';
import { NewsRow } from '@/components/news/NewsRow';
import { useNews } from '@/lib/api/news';
import { Colors, FontFamily, Spacing } from '@/constants/theme';

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const { data: news = [], isLoading, isError, refetch } = useNews();

  return (
    <View style={styles.root}>
      <ScreenHeader title="The Brief" />

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
              <EmptyState
                icon="flash"
                title="No news yet"
                caption="Fresh card-market stories land here — check back soon."
              />
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

  eyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.text3,
    marginBottom: 12,
  },

  separator: { height: 1, backgroundColor: Colors.line },
});
