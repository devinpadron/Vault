import { Icon } from "@/components/ui/Icon";
import { Colors, FontFamily, Radius, Spacing } from "@/constants/theme";
import {
  VisionAnalysis,
  VisionMatch,
  VisionMatchCard,
  confidenceLabel,
  identifyCardFromImage,
} from "@/lib/api/vision";
import { fetchCardById } from "@/lib/api/cards";
import { useAddToCollection } from "@/lib/db/collection";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Scrydex Vision is the recognition pipeline. The capture flow goes:
//   photo  ──► /functions/v1/identify  ──► Scrydex /vision/v1/cards/identify
//   ◄── matches[] with confidence scores ───────────────────────────────────
//
// The API key never leaves the Edge Function. Scores typically sit in
// the 0.7–1.3+ band; we bucket them into strong / likely / low for display
// (see confidenceLabel in lib/api/vision.ts).

type Phase = "scanning" | "captured";

type IdentifyState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "matched"; matches: VisionMatch[]; analysis: VisionAnalysis | null }
  | { kind: "no-match" }
  | { kind: "error"; message: string };

// Card-aspect (1 : 1.4) framing guide. Sized generously so a card fills the
// frame from a comfortable distance instead of needing to be right up against
// the lens.
const RETICLE_W = 310;
const RETICLE_H = 434;

// Anything below this is treated as "no usable match" — surfacing a 0.4 score
// to the user would be more confusing than helpful.
const MIN_MATCH_SCORE = 0.7;

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [torchOn, setTorchOn] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [identify, setIdentify] = useState<IdentifyState>({ kind: "idle" });
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const addToCollection = useAddToCollection();
  // Quick-add: drop a matched card into the collection and immediately return to
  // scanning, so the user can rip through a stack without leaving the camera.
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Auto-request permission on first mount. If the user previously denied it,
  // they can re-grant via the in-screen button below.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const beamY = useSharedValue(0);

  // Sweep beam runs during the scanning phase. Pauses once a photo is
  // captured so the frozen-frame moment reads as intentional.
  useEffect(() => {
    if (phase === "scanning") {
      beamY.value = 0;
      beamY.value = withRepeat(
        withTiming(RETICLE_H, { duration: 1800, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(beamY);
    }
  }, [phase, beamY]);

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: beamY.value }],
  }));

  async function handleCapture() {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let uri: string | null = null;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      uri = photo?.uri ?? null;
    } catch (err) {
      if (__DEV__) console.warn("[scanner] capture failed:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!uri) return;

    setCapturedUri(uri);
    setPhase("captured");
    setIdentify({ kind: "loading" });

    try {
      const res = await identifyCardFromImage(uri);
      const usable = (res.matches ?? []).filter(m => m.score >= MIN_MATCH_SCORE);
      if (usable.length === 0) {
        setIdentify({ kind: "no-match" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        setIdentify({ kind: "matched", matches: usable, analysis: res.analysis });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Identify failed";
      if (__DEV__) console.warn("[scanner] identify failed:", err);
      setIdentify({ kind: "error", message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function handleRetake() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCapturedUri(null);
    setIdentify({ kind: "idle" });
    setPhase("scanning");
  }

  const handleQuickAdd = useCallback(
    async (match: VisionMatchCard) => {
      if (adding) return;
      setAdding(true);
      try {
        // The vision payload is a brief card shape; hydrate the full row so the
        // collection mirror stores real art / value, not a placeholder.
        const full = await fetchCardById(match.id);
        if (!full) throw new Error("not in catalog");
        await addToCollection(full);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`Added ${full.name}`);
        // Straight back to scanning for the next card.
        setCapturedUri(null);
        setIdentify({ kind: "idle" });
        setPhase("scanning");
      } catch (err) {
        const message = err instanceof Error ? err.message : "add failed";
        if (__DEV__) console.warn("[scanner] quick-add failed:", err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast(`Couldn't add — ${message}`, true);
      } finally {
        setAdding(false);
      }
    },
    [adding, addToCollection, showToast],
  );

  function handleSearch() {
    // Replace so back from /search returns to the tabs, not to a stale
    // captured-photo state on the scanner.
    router.replace("/search");
  }

  function handleOpenMatch(cardId: string) {
    Haptics.selectionAsync();
    router.replace(`/card/${cardId}`);
  }

  // Until we have camera permission, render only the permission state — no
  // reticle, no capture button, no result sheet.
  if (!permission || !permission.granted) {
    return (
      <View style={styles.screen}>
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.back()}
            accessibilityLabel="Close scanner"
            accessibilityRole="button"
          >
            <Icon name="close" size={18} color={Colors.text} />
          </TouchableOpacity>
          <View />
        </View>
        <View style={styles.permissionPrompt}>
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionBody}>
            {permission?.canAskAgain === false
              ? "Vault needs camera access to identify a card. Enable it in iOS Settings → Vault → Camera, then come back."
              : "Vault uses the camera to identify cards via Scrydex Vision. Capture a clear photo of the card front and we'll match it against the catalog."}
          </Text>
          {permission?.canAskAgain !== false ? (
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={requestPermission}
            >
              <Text style={styles.permissionBtnText}>Allow camera</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.permissionDenied}>Permission denied</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Camera layer — sits behind every other element. */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
      />
      {/* Dimming layer keeps the corner brackets readable against the live feed. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0,0,0,0.45)" },
        ]}
        pointerEvents="none"
      />

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
            {phase === "scanning"
              ? "SCAN MODE"
              : identify.kind === "loading"
              ? "IDENTIFYING"
              : identify.kind === "matched"
              ? "MATCH FOUND"
              : "CAPTURED"}
          </Text>
        </View>
        {phase === "scanning" ? (
          <TouchableOpacity
            style={[styles.iconBtn, torchOn && styles.iconBtnActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setTorchOn(v => !v);
            }}
            accessibilityLabel={torchOn ? "Turn off flash" : "Turn on flash"}
            accessibilityRole="button"
          >
            <Icon name="flash" size={16} color={torchOn ? "#0A0A0C" : Colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {/* Center */}
      <View style={styles.center} pointerEvents="none">
        {phase === "scanning" ? (
          <View style={styles.reticle}>
            {[
              { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
              { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
              { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
              { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
            ].map((pos, i) => (
              <View
                key={i}
                style={[styles.corner, pos, { borderColor: Colors.gold }]}
              />
            ))}
            <Animated.View style={[styles.beam, beamStyle]} />
          </View>
        ) : (
          capturedUri && (
            <Image
              source={{ uri: capturedUri }}
              style={styles.capturedPreview}
              contentFit="cover"
              transition={120}
            />
          )
        )}
        {phase === "captured" && identify.kind === "loading" && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={Colors.gold} />
            <Text style={styles.loadingText}>Identifying…</Text>
          </View>
        )}
      </View>

      {/* Quick-add confirmation toast */}
      {toast && (
        <Animated.View
          entering={FadeInUp.duration(200)}
          style={[
            styles.toast,
            toast.error && styles.toastError,
            { bottom: insets.bottom + 120 },
          ]}
          pointerEvents="none"
        >
          <Icon
            name={toast.error ? "close" : "check"}
            size={14}
            color={toast.error ? Colors.text : "#0A0A0C"}
          />
          <Text
            style={[styles.toastText, toast.error && styles.toastTextError]}
            numberOfLines={1}
          >
            {toast.text}
          </Text>
        </Animated.View>
      )}

      {/* Bottom */}
      {phase === "scanning" ? (
        <View style={[styles.scanBottom, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.hint}>Frame the card</Text>
          <Text style={styles.subLabel}>
            Hold steady and capture — Scrydex Vision will identify the card.
          </Text>
          <TouchableOpacity
            onPress={handleCapture}
            style={styles.captureBtn}
            accessibilityLabel="Capture and identify"
            accessibilityRole="button"
            activeOpacity={0.85}
          >
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View
          entering={FadeInUp.duration(280)}
          style={[styles.resultSheet, { paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.resultGrabber} />
          {identify.kind === "loading" && (
            <ResultLoading />
          )}
          {identify.kind === "matched" && (
            <ResultMatched
              matches={identify.matches}
              analysis={identify.analysis}
              adding={adding}
              onOpen={handleOpenMatch}
              onQuickAdd={handleQuickAdd}
              onRetake={handleRetake}
              onSearch={handleSearch}
            />
          )}
          {identify.kind === "no-match" && (
            <ResultEmpty onRetake={handleRetake} onSearch={handleSearch} />
          )}
          {identify.kind === "error" && (
            <ResultError
              message={identify.message}
              onRetake={handleRetake}
              onSearch={handleSearch}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

// Prefer the explicit front image — Scrydex returns both faces for some
// cards and array order isn't guaranteed.
function frontImage(m: VisionMatch) {
  const imgs = m.card.images ?? [];
  return imgs.find(i => i.type === "front") ?? imgs[0];
}

function ResultLoading() {
  return (
    <>
      <Text style={styles.resultEyebrow}>SCRYDEX VISION</Text>
      <Text style={styles.resultTitle}>Identifying card…</Text>
      <Text style={styles.resultBody}>
        Matching against the Pokémon catalog. This usually takes 1–3 seconds.
      </Text>
    </>
  );
}

function ResultMatched({
  matches,
  analysis,
  adding,
  onOpen,
  onQuickAdd,
  onRetake,
  onSearch,
}: {
  matches: VisionMatch[];
  analysis: VisionAnalysis | null;
  adding: boolean;
  onOpen: (id: string) => void;
  onQuickAdd: (card: VisionMatchCard) => void;
  onRetake: () => void;
  onSearch: () => void;
}) {
  const top = matches[0];
  const alternates = matches.slice(1, 4);
  const topImage = frontImage(top);
  const label = confidenceLabel(top.score);
  const labelText =
    label === "strong" ? "Strong match" : label === "likely" ? "Likely match" : "Possible match";
  const labelColor =
    label === "strong" ? Colors.up : label === "likely" ? Colors.gold : Colors.text2;

  return (
    <>
      <View style={styles.matchHeader}>
        <Text style={[styles.confidenceLabel, { color: labelColor }]}>
          {labelText} · {top.score.toFixed(2)}
        </Text>
        {analysis?.graded_details && (
          <Text style={styles.gradedTag}>
            {analysis.graded_details.company} {analysis.graded_details.grade_number}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.topMatch}
        onPress={() => onOpen(top.card.id)}
        accessibilityLabel={`Open ${top.card.name}`}
        accessibilityRole="button"
        activeOpacity={0.85}
      >
        {topImage?.medium ? (
          <Image
            source={{ uri: topImage.medium }}
            style={styles.topMatchImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.topMatchImage, styles.imagePlaceholder]} />
        )}
        <View style={styles.topMatchMeta}>
          <Text style={styles.topMatchName} numberOfLines={2}>{top.card.name}</Text>
          {top.card.expansion && (
            <Text style={styles.topMatchSet}>
              {top.card.expansion.name.toUpperCase()}
              {top.card.printed_number ? ` · ${top.card.printed_number}` : ""}
            </Text>
          )}
          {top.variant && (
            <Text style={styles.topMatchVariant}>{top.variant}</Text>
          )}
          <Text style={styles.openHint}>Tap to view details →</Text>
        </View>
      </TouchableOpacity>

      {alternates.length > 0 && (
        <>
          <Text style={styles.alternateLabel}>OTHER CANDIDATES</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.alternateRow}
          >
            {alternates.map(m => {
              const altImg = frontImage(m);
              return (
              <TouchableOpacity
                key={m.card.id}
                style={styles.alternateCell}
                onPress={() => onOpen(m.card.id)}
                activeOpacity={0.85}
                accessibilityLabel={`Open ${m.card.name}`}
              >
                {altImg?.small ? (
                  <Image
                    source={{ uri: altImg.small }}
                    style={styles.alternateImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.alternateImage, styles.imagePlaceholder]} />
                )}
                <Text style={styles.alternateName} numberOfLines={1}>
                  {m.card.name}
                </Text>
                <Text style={styles.alternateScore}>{m.score.toFixed(2)}</Text>
              </TouchableOpacity>
            );
            })}
          </ScrollView>
        </>
      )}

      <TouchableOpacity
        style={[styles.addBtn, adding && styles.addBtnDisabled]}
        onPress={() => onQuickAdd(top.card)}
        disabled={adding}
        accessibilityLabel={`Add ${top.card.name} to collection and keep scanning`}
        accessibilityRole="button"
        activeOpacity={0.85}
      >
        {adding ? (
          <ActivityIndicator color="#0A0A0C" />
        ) : (
          <>
            <Icon name="plus" size={16} color="#0A0A0C" />
            <Text style={styles.addBtnText}>Add & keep scanning</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.resultCtaRow}>
        <TouchableOpacity
          style={styles.retakeBtn}
          onPress={onRetake}
          accessibilityLabel="Retake photo"
          accessibilityRole="button"
        >
          <Text style={styles.retakeText}>Retake</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={onSearch}
          accessibilityLabel="Search manually"
          accessibilityRole="button"
        >
          <Text style={styles.ghostBtnText}>Not it — search</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function ResultEmpty({ onRetake, onSearch }: { onRetake: () => void; onSearch: () => void }) {
  return (
    <>
      <Text style={styles.resultEyebrow}>NO MATCH</Text>
      <Text style={styles.resultTitle}>Couldn&apos;t identify this card</Text>
      <Text style={styles.resultBody}>
        Try retaking with the card filling more of the frame and better lighting,
        or search by the card&apos;s name.
      </Text>
      <View style={styles.resultCtaRow}>
        <TouchableOpacity style={styles.retakeBtn} onPress={onRetake}>
          <Text style={styles.retakeText}>Retake</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch}>
          <Text style={styles.searchBtnText}>Search by name</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

function ResultError({
  message,
  onRetake,
  onSearch,
}: {
  message: string;
  onRetake: () => void;
  onSearch: () => void;
}) {
  return (
    <>
      <Text style={[styles.resultEyebrow, { color: Colors.down }]}>IDENTIFY FAILED</Text>
      <Text style={styles.resultTitle}>Something went wrong</Text>
      <Text style={styles.resultBody}>{message}</Text>
      <View style={styles.resultCtaRow}>
        <TouchableOpacity style={styles.retakeBtn} onPress={onRetake}>
          <Text style={styles.retakeText}>Retake</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch}>
          <Text style={styles.searchBtnText}>Search by name</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050507",
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: {
    backgroundColor: Colors.gold,
  },
  modeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  modeBadgeText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: Colors.text,
  },
  permissionPrompt: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
    top: -60,
  },
  permissionTitle: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    color: Colors.text,
    textAlign: "center",
  },
  permissionBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text2,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 320,
  },
  permissionBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
  },
  permissionBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: "#0A0A0C",
  },
  permissionDenied: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.text3,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reticle: {
    width: RETICLE_W,
    height: RETICLE_H,
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
  },
  beam: {
    position: "absolute",
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
  capturedPreview: {
    width: RETICLE_W,
    height: RETICLE_H,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  loadingOverlay: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 6,
  },
  loadingText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    color: Colors.text,
  },
  scanBottom: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 24,
    gap: 12,
  },
  hint: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    color: Colors.text,
    textAlign: "center",
  },
  subLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 0.8,
    textAlign: "center",
    lineHeight: 15,
    maxWidth: 280,
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  captureBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.gold,
  },
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
    alignSelf: "center",
    marginBottom: 14,
  },
  resultEyebrow: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: Colors.text3,
    marginBottom: 6,
  },
  resultTitle: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    color: Colors.text,
    lineHeight: 30,
    marginBottom: 8,
  },
  resultBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
    marginBottom: 18,
  },
  // Matched layout
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  confidenceLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.8,
  },
  gradedTag: {
    fontFamily: FontFamily.monoMed,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
    backgroundColor: "rgba(255,215,0,0.1)",
  },
  topMatch: {
    flexDirection: "row",
    gap: 14,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 14,
  },
  topMatchImage: {
    width: 72,
    height: 100,
    borderRadius: 6,
    backgroundColor: Colors.bg,
  },
  imagePlaceholder: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  topMatchMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 4,
  },
  topMatchName: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    color: Colors.text,
    lineHeight: 22,
  },
  topMatchSet: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    color: Colors.text3,
  },
  topMatchVariant: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.text2,
    letterSpacing: 0.8,
  },
  openHint: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: Colors.gold,
    marginTop: 4,
  },
  alternateLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    letterSpacing: 1.8,
    color: Colors.text3,
    marginBottom: 8,
  },
  alternateRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingBottom: 4,
  },
  alternateCell: {
    width: 76,
    gap: 4,
  },
  alternateImage: {
    width: 76,
    height: 106,
    borderRadius: 6,
    backgroundColor: Colors.bg,
  },
  alternateName: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Colors.text,
  },
  alternateScore: {
    fontFamily: FontFamily.mono,
    fontSize: 9,
    color: Colors.text3,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    marginTop: 4,
  },
  addBtnDisabled: {
    opacity: 0.7,
  },
  addBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 15,
    color: "#0A0A0C",
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: Radius.full,
    backgroundColor: Colors.gold,
    maxWidth: "86%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  toastError: {
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.down,
  },
  toastText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 13,
    color: "#0A0A0C",
    flexShrink: 1,
  },
  toastTextError: {
    color: Colors.text,
  },
  resultCtaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  retakeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  retakeText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 13,
    color: Colors.text,
  },
  searchBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.md,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 14,
    color: "#0A0A0C",
  },
  ghostBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: {
    fontFamily: FontFamily.bodySemi,
    fontSize: 13,
    color: Colors.text,
  },
});
