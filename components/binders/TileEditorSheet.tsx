// Beautify editor: upload a photo and place it on a binder page — either as a
// "tile" occupying a chosen set of the 9 cells (tap cells to toggle; the photo
// composites across the selection via per-cell slice offsets) or as a full-page
// background. Also lists the current page's existing media for deletion.
//
// Image upload reuses the avatar flow (uploadBinderImage → Supabase Storage).

import { ComponentProps, ReactNode, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/ui/Icon';
import {
  BinderMediaItem,
  uploadBinderImage,
  useAddBinderMedia,
  useBinderItems,
  useBinderMedia,
  useRemoveBinderMedia,
} from '@/lib/api/binders';
import { useAuth } from '@/lib/auth/AuthContext';
import { CARD_ASPECT, maskBounds, PAGE_SIZE } from '@/lib/binder/grid-geometry';
import { Colors, FontFamily, Radius, Spacing } from '@/constants/theme';

type Mode = 'tile' | 'grid' | 'background';
const GRID_GAP = 6;
const MODES: { key: Mode; label: string }[] = [
  { key: 'tile', label: 'Tiles' },
  { key: 'grid', label: 'Grid' },
  { key: 'background', label: 'Full page' },
];

/** Rectangle mask spanning the two corner cells (inclusive). */
function rectMask(a: number, b: number): number {
  const ar = Math.floor(a / 3), ac = a % 3;
  const br = Math.floor(b / 3), bc = b % 3;
  const r0 = Math.min(ar, br), r1 = Math.max(ar, br);
  const c0 = Math.min(ac, bc), c1 = Math.max(ac, bc);
  let mask = 0;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) mask |= 1 << (r * 3 + c);
  return mask;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  binderId: string;
  pageNum: number;
}

export function TileEditorSheet({ visible, onClose, binderId, pageNum }: Props) {
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const addMedia = useAddBinderMedia();
  const removeMedia = useRemoveBinderMedia();
  const { data: media = [] } = useBinderMedia(binderId);
  const { data: items = [] } = useBinderItems(binderId);

  const [mode, setMode] = useState<Mode>('tile');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string | undefined>(undefined);
  const [mask, setMask] = useState(0);
  const [saving, setSaving] = useState(false);

  const pageMedia = useMemo(() => media.filter(md => md.pageNum === pageNum), [media, pageNum]);
  // Cells taken by other tiles OR by a card on this page can't be re-used.
  const lockedMask = useMemo(() => {
    let mask = pageMedia.reduce((a, md) => (md.kind === 'tile' ? a | (md.cellMask & 0x1ff) : a), 0);
    for (const it of items) {
      if (Math.floor(it.position / PAGE_SIZE) === pageNum) mask |= 1 << (it.position % PAGE_SIZE);
    }
    return mask;
  }, [pageMedia, items, pageNum]);

  const gridW = screenWidth - Spacing.xl * 2;
  const cellW = (gridW - GRID_GAP * 2) / 3;
  const cellH = cellW * CARD_ASPECT;            // portrait cells, matching the binder grid
  const contentBoxW = gridW;
  const contentBoxH = cellH * 3 + GRID_GAP * 2;

  // Grid mode: press-and-drag a rectangle (the whole photo fits inside it).
  const anchorCell = useRef(0);
  const gridGesture = useMemo(() => {
    const at = (x: number, y: number) => {
      const col = Math.max(0, Math.min(2, Math.floor(x / (cellW + GRID_GAP))));
      const row = Math.max(0, Math.min(2, Math.floor(y / (cellH + GRID_GAP))));
      return row * 3 + col;
    };
    return Gesture.Pan().runOnJS(true)
      .onBegin(e => { const c = at(e.x, e.y); anchorCell.current = c; setMask(rectMask(c, c)); })
      .onUpdate(e => { setMask(rectMask(anchorCell.current, at(e.x, e.y))); });
  }, [cellW, cellH]);

  function reset() {
    setPickedUri(null);
    setPickedMime(undefined);
    setMask(0);
    setMode('tile');
  }

  function close() {
    reset();
    onClose();
  }

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    const asset = res.assets?.[0];
    if (res.canceled || !asset) return;
    setPickedUri(asset.uri);
    setPickedMime(asset.mimeType);
  }

  function toggleCell(cell: number) {
    const isOn = !!(mask & (1 << cell));
    // A locked cell (card / other tile) can't be turned ON, but an already-
    // selected one can always be turned OFF — e.g. cells carried over from a
    // grid-mode rectangle that landed on an occupied square.
    if (!isOn && (lockedMask & (1 << cell))) return;
    setMask(m => (isOn ? m & ~(1 << cell) : m | (1 << cell)));
  }

  async function save() {
    if (!user || !pickedUri) return;
    if (mode !== 'background') {
      if (mask === 0) {
        Alert.alert(
          'Pick an area',
          mode === 'grid' ? 'Drag to size the photo block.' : 'Tap the squares this photo should fill.',
        );
        return;
      }
      if (mask & lockedMask) {
        Alert.alert('Overlapping squares', 'Some chosen squares already hold a card or photo — pick a clear area.');
        return;
      }
    }
    setSaving(true);
    try {
      const url = await uploadBinderImage({
        userId: user.id, binderId, uri: pickedUri, mimeType: pickedMime,
      });
      await addMedia({
        binderId,
        pageNum,
        kind: mode === 'background' ? 'background' : 'tile',
        cellMask: mode === 'background' ? 0 : mask,
        storageKey: url,
        transform: mode === 'grid' ? { fitMode: 'bbox' } : null,
      });
      close();
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Image slice shown in a selected preview cell: 'grid' fits the whole photo to
  // the selection's bounding box; 'tile' windows a page-sized image (mosaic).
  function sliceImage(row: number, col: number) {
    if (!pickedUri) return null;
    if (mode === 'grid') {
      const b = maskBounds(mask);
      return (
        <Image
          source={{ uri: pickedUri }}
          style={{
            position: 'absolute',
            width: b.cols * cellW + (b.cols - 1) * GRID_GAP,
            height: b.rows * cellH + (b.rows - 1) * GRID_GAP,
            left: -((col - b.minCol) * (cellW + GRID_GAP)),
            top: -((row - b.minRow) * (cellH + GRID_GAP)),
          }}
          contentFit="cover"
        />
      );
    }
    return (
      <Image
        source={{ uri: pickedUri }}
        style={{
          position: 'absolute',
          width: contentBoxW,
          height: contentBoxH,
          left: -(col * (cellW + GRID_GAP)),
          top: -(row * (cellH + GRID_GAP)),
        }}
        contentFit="cover"
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.eyebrow}>BEAUTIFY · PAGE {pageNum + 1}</Text>
        <Text style={styles.title}>Add a photo</Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          scrollEnabled={mode !== 'grid'}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {/* Existing media on this page */}
          {pageMedia.length > 0 && (
            <View style={styles.existingRow}>
              {pageMedia.map(md => (
                <ExistingChip key={md.id} media={md} onDelete={() => removeMedia(binderId, md.id)} />
              ))}
            </View>
          )}

          {!pickedUri ? (
            <TouchableOpacity style={styles.pickBtn} onPress={pick}>
              <Icon name="camera" size={20} color={Colors.gold} />
              <Text style={styles.pickBtnText}>Choose a photo</Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Mode toggle */}
              <View style={styles.segmented}>
                {MODES.map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setMode(key)}
                    style={[styles.segment, mode === key && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, mode === key && styles.segmentTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Preview grid */}
              <MaybeGesture enabled={mode === 'grid'} gesture={gridGesture}>
                <View style={[styles.previewGrid, { width: gridW, height: contentBoxH }]}>
                  {mode === 'background' && (
                    <Image source={{ uri: pickedUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  )}
                  {[0, 1, 2].map(row => (
                    <View key={row} style={styles.previewRow}>
                      {[0, 1, 2].map(col => {
                        const cell = row * 3 + col;
                        const on = !!(mask & (1 << cell)) && mode !== 'background';
                        const locked = !!(lockedMask & (1 << cell));
                        const cellStyle = [
                          styles.previewCell,
                          { width: cellW, height: cellH },
                          on && styles.previewCellOn,
                          locked && styles.previewCellLocked,
                        ];
                        if (mode === 'tile') {
                          return (
                            <TouchableOpacity
                              key={col}
                              activeOpacity={0.8}
                              onPress={() => toggleCell(cell)}
                              style={cellStyle}
                            >
                              {on && sliceImage(row, col)}
                            </TouchableOpacity>
                          );
                        }
                        return (
                          <View key={col} style={cellStyle}>
                            {on && sliceImage(row, col)}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </MaybeGesture>

              <Text style={styles.help}>
                {mode === 'tile'
                  ? 'Tap squares — the photo is sliced across them (mosaic). Locked squares hold a card or photo.'
                  : mode === 'grid'
                    ? 'Drag to size a block; the whole photo fits inside it.'
                    : 'This photo fills the whole page behind your cards.'}
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={pick}>
                  <Text style={styles.secondaryBtnText}>Replace photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color={Colors.bg} />
                    : <Text style={styles.saveBtnText}>Add to binder</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Wraps the preview grid in a drag GestureDetector only in grid mode (so tile
 *  mode's per-cell taps aren't intercepted). */
function MaybeGesture({
  enabled, gesture, children,
}: {
  enabled: boolean;
  gesture: ComponentProps<typeof GestureDetector>['gesture'];
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

function ExistingChip({ media, onDelete }: { media: BinderMediaItem; onDelete: () => void }) {
  return (
    <View style={styles.existingChip}>
      <Image source={{ uri: media.url }} style={styles.existingThumb} contentFit="cover" />
      <Text style={styles.existingLabel}>{media.kind === 'background' ? 'Background' : 'Tile'}</Text>
      <TouchableOpacity onPress={onDelete} hitSlop={8} accessibilityLabel="Delete photo">
        <Icon name="trash" size={14} color={Colors.down} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.scrim },
  sheet: {
    backgroundColor: Colors.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: 8,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: Colors.line,
  },
  grabber: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.line, alignSelf: 'center', marginBottom: 16,
  },
  eyebrow: {
    fontFamily: FontFamily.mono, fontSize: 10, letterSpacing: 1.6,
    color: Colors.text3, marginBottom: 4,
  },
  title: { fontFamily: FontFamily.display, fontSize: 24, color: Colors.text, marginBottom: 16 },
  existingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  existingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingRight: 10, paddingLeft: 4, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.line,
    backgroundColor: Colors.glass,
  },
  existingThumb: { width: 24, height: 24, borderRadius: 12 },
  existingLabel: { fontFamily: FontFamily.mono, fontSize: 10, color: Colors.text2 },
  pickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 40, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.goldBorder, borderStyle: 'dashed',
    backgroundColor: Colors.goldFaint,
  },
  pickBtnText: { fontFamily: FontFamily.bodySemi, fontSize: 15, color: Colors.gold },
  segmented: {
    flexDirection: 'row', borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radius.full, overflow: 'hidden', backgroundColor: Colors.glass, marginBottom: 16,
  },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.goldTint },
  segmentText: { fontFamily: FontFamily.mono, fontSize: 10, letterSpacing: 0.4, color: Colors.text2 },
  segmentTextActive: { color: Colors.gold },
  previewGrid: {
    alignSelf: 'center', borderRadius: Radius.md, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  previewRow: { flexDirection: 'row', gap: GRID_GAP, marginBottom: GRID_GAP },
  previewCell: {
    borderRadius: Radius.sm, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewCellOn: { borderColor: Colors.gold },
  previewCellLocked: { backgroundColor: 'rgba(0,0,0,0.4)' },
  help: {
    fontFamily: FontFamily.body, fontSize: 12, color: Colors.text3,
    marginTop: 12, textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryBtn: {
    flex: 1, paddingVertical: 14, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line, alignItems: 'center', backgroundColor: Colors.glass,
  },
  secondaryBtnText: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: Colors.text },
  saveBtn: {
    flex: 1.4, paddingVertical: 14, borderRadius: Radius.md,
    backgroundColor: Colors.gold, alignItems: 'center',
  },
  saveBtnText: { fontFamily: FontFamily.bodySemi, fontSize: 14, color: Colors.bg },
});
