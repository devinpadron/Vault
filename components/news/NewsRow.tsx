import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontFamily } from '@/constants/theme';
import { NewsItem } from '@/types';

// Shared news row. Two surfaces use it — the home-screen "The Brief" preview
// (compact) and the dedicated news screen (default). The compact variant uses
// smaller artwork and a darker background so it sits inside the bordered
// list card on the home screen; the default variant is roomier and assumes
// the parent draws separators.

interface Props {
  item: NewsItem;
  compact?: boolean;
}

export function NewsRow({ item, compact = false }: Props) {
  const onPress = () => {
    if (item.url) Linking.openURL(item.url).catch(() => {});
  };

  const artSize = compact ? compactArt : defaultArt;
  const container = compact ? styles.itemCompact : styles.itemDefault;

  return (
    <TouchableOpacity
      style={container}
      onPress={onPress}
      activeOpacity={item.url ? 0.85 : 1}
      accessibilityRole={item.url ? 'link' : undefined}
      accessibilityLabel={item.title}
    >
      <View style={[styles.art, artSize]}>
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
      <View style={styles.meta}>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>{item.tag}</Text>
          <View style={styles.dot} />
          <Text style={styles.when}>{item.when}</Text>
        </View>
        <Text style={styles.title} numberOfLines={3}>{item.title}</Text>
        {/* Read-time is an estimate from title+summary word count, not a real
            field — the leading "~" signals that to the reader. */}
        <Text style={styles.minutes}>~{item.minutes} MIN READ</Text>
      </View>
    </TouchableOpacity>
  );
}

const compactArt = { width: 48, height: 64 };
const defaultArt = { width: 56, height: 72 };

const styles = StyleSheet.create({
  itemCompact: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  itemDefault: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  art: {
    borderRadius: 6,
    overflow: 'hidden',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  meta: { flex: 1, minWidth: 0 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tag: {
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
  title: {
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
});
