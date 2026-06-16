import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { Colors, FontFamily, Shadows } from '@/constants/theme';

// Height of the tab bar above the safe-area inset (wrapper paddingTop 12 +
// row content ~50). Consumers add Math.max(insets.bottom, 8) to clear it.
export const TAB_BAR_BASE_HEIGHT = 62;

const TABS = [
  { name: 'index',      icon: 'home'   as const, label: 'Home' },
  { name: 'collection', icon: 'grid'   as const, label: 'Cards' },
  { name: '__scan__',   icon: 'scan'   as const, label: 'Scan', isFab: true },
  { name: 'friends',    icon: 'people' as const, label: 'Friends' },
  { name: 'market',     icon: 'market' as const, label: 'Market' },
];

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  const getRouteIndex = (routeName: string) =>
    state.routes.findIndex(r => r.name === routeName);

  const handlePress = (tabName: string, isFab?: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isFab) {
      router.push('/scanner');
      return;
    }
    const idx = getRouteIndex(tabName);
    if (idx === -1) return;
    const isFocused = state.index === idx;
    const event = navigation.emit({ type: 'tabPress', target: state.routes[idx].key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(state.routes[idx].name);
    }
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPad }]}>
      <LinearGradient
        colors={['rgba(10,10,12,0)', 'rgba(10,10,12,0.92)', Colors.bg]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.row}>
        {TABS.map(tab => {
          const idx = getRouteIndex(tab.name);
          const active = !tab.isFab && state.index === idx;

          if (tab.isFab) {
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => handlePress(tab.name, true)}
                style={styles.fabWrapper}
                accessibilityLabel="Scan a card"
                accessibilityRole="button"
              >
                <View style={styles.fab}>
                  <Icon name="scan" size={22} color="#0A0A0C" />
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => handlePress(tab.name)}
              style={styles.tabBtn}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
            >
              <Icon
                name={tab.icon}
                size={22}
                color={active ? Colors.gold : Colors.text3}
              />
              <Text style={[styles.label, active && styles.labelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 14,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  fabWrapper: {
    alignItems: 'center',
    flex: 1,
    marginTop: -14,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.goldGlow,
    borderWidth: 3,
    borderColor: Colors.bg,
  },
  label: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.text3,
  },
  labelActive: {
    color: Colors.gold,
  },
});
