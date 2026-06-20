import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

const NAME_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  home:          'home-outline',
  grid:          'grid-outline',
  scan:          'scan-outline',
  people:        'people-outline',
  market:        'trending-up-outline',
  search:        'search-outline',
  bell:          'notifications-outline',
  'chevron-left':  'chevron-back',
  'chevron-right': 'chevron-forward',
  heart:         'heart-outline',
  flash:         'flash-outline',
  menu:          'ellipsis-horizontal',
  share:         'share-outline',
  trash:         'trash-outline',
  edit:          'create-outline',
  plus:          'add',
  minus:         'remove',
  close:         'close',
  sort:          'funnel-outline',
  'arrow-up':    'trending-up',
  'arrow-down':  'trending-down',
  star:          'star',
  check:         'checkmark',
  eye:           'eye-outline',
  'eye-off':     'eye-off-outline',
  binders:       'albums-outline',
  settings:      'settings-outline',
  logout:        'log-out-outline',
  camera:        'camera-outline',
  palette:       'color-palette-outline',
  compare:       'git-compare-outline',
  activity:      'pulse-outline',
};

interface Props {
  name: keyof typeof NAME_MAP;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 20, color = Colors.text }: Props) {
  const glyphName = NAME_MAP[name] ?? 'help-circle-outline';
  return <Ionicons name={glyphName} size={size} color={color} />;
}
