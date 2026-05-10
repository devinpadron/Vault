import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

interface Props {
  data: number[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = '#4ADE80', height = 36 }: Props) {
  if (data.length < 2) return null;

  const W = 280;
  const H = 40;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((v - min) / range) * (H - 8) - 4,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} style={{ opacity: 0.7 }}>
      <Defs>
        <LinearGradient id="sparkg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill="url(#sparkg)" />
      <Path d={linePath} fill="none" stroke={color} strokeWidth="1.5" />
    </Svg>
  );
}
