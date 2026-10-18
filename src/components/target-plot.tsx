import { useEffect, useMemo, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';

import { FaceSvg, type Marker } from '@/components/face-svg';

import type { Face } from '@/lib/faces';
import { LogShot } from '@/lib/log-model';
import {
  fitScale,
  magnifierPlacement,
  nearestShot,
  pickAt,
  sceneOf,
  toPixel,
  type PlotPoint,
  type Scene,
} from '@/lib/plot';
import { score } from '@/lib/scoring';
import { newId } from '@/lib/uuid';

const MAX_HEIGHT_PX = 380;
const HIT_PX = 16; // how close a touch must be to an arrow to move it instead of placing a new one
const MAGNIFIER_PX = 130;
const ZOOM = 4;
const GAP_PX = 36;

function shotAt(face: Face, point: PlotPoint, id: string, keep?: LogShot): LogShot {
  const result = score(face, point.x, point.y);
  return { ...keep, id, value: result.value, is_x: result.is_x, is_miss: result.is_miss, x: point.x, y: point.y, spot: point.spot };
}

type Inputs = {
  face: Face;
  shots: LogShot[];
  max: number;
  scene: Scene;
  scale: number;
  width: number;
  height: number;
  onChange: (shots: LogShot[]) => void;
};
type Touch = { px: number; py: number };

/** Turns touches into placed or moved arrows. Kept outside React so it can always see the latest inputs. */
class PlotGesture {
  private inputs: Inputs;
  readonly responder;
  private startX = 0;
  private startY = 0;
  private drag = -1;
  private x = 0;
  private y = 0;

  constructor(
    inputs: Inputs,
    private show: (touch: Touch | null, dragIndex: number) => void,
  ) {
    this.inputs = inputs;
    this.responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => this.grant(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (_, s) => this.move(s.dx, s.dy),
      onPanResponderRelease: () => this.finish(true),
      onPanResponderTerminate: () => this.finish(false),
    });
  }

  update(inputs: Inputs) {
    this.inputs = inputs;
  }

  private get full() {
    return this.drag < 0 && this.inputs.shots.length >= this.inputs.max;
  }

  private grant(locationX: number, locationY: number) {
    const { face, shots, scene, scale, width, height } = this.inputs;
    this.startX = Math.max(0, Math.min(locationX, width));
    this.startY = Math.max(0, Math.min(locationY, height));
    const plotted = shots.flatMap((s, i) => (s.x === undefined || s.y === undefined ? [] : [i]));
    const points = plotted.map((i) => toPixel(face, scene, scale, { spot: shots[i].spot ?? 0, x: shots[i].x!, y: shots[i].y! }));
    const hit = nearestShot(points, this.startX, this.startY, HIT_PX);
    this.drag = hit >= 0 ? plotted[hit] : -1;
    this.x = this.startX;
    this.y = this.startY;
    if (!this.full) this.show({ px: this.x, py: this.y }, this.drag); // a full end only lets arrows be moved
  }

  private move(dx: number, dy: number) {
    if (this.full) return;
    const { width, height } = this.inputs;
    this.x = Math.max(0, Math.min(this.startX + dx, width));
    this.y = Math.max(0, Math.min(this.startY + dy, height));
    this.show({ px: this.x, py: this.y }, this.drag);
  }

  private finish(commit: boolean) {
    const { face, shots, scene, scale, onChange } = this.inputs;
    if (commit && !this.full) {
      const point = pickAt(face, scene, scale, this.x, this.y);
      if (this.drag >= 0) onChange(shots.map((s, i) => (i === this.drag ? shotAt(face, point, s.id, s) : s)));
      else onChange([...shots, shotAt(face, point, newId())]);
    }
    this.show(null, -1);
  }
}

/**
 * Touch the face to place an arrow: while the finger is down a magnifier above it shows the exact
 * spot, and lifting places the arrow. Touching an existing arrow moves it instead.
 */
export function TargetPlot({
  face,
  shots,
  max,
  selectedId,
  onChange,
}: {
  face: Face;
  shots: LogShot[];
  max: number;
  selectedId: string | null;
  onChange: (shots: LogShot[]) => void;
}) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [touch, setTouch] = useState<{ px: number; py: number } | null>(null);
  const [dragIndex, setDragIndex] = useState(-1);

  const scene: Scene = useMemo(() => sceneOf(face), [face]);
  const scale = boxWidth > 0 ? fitScale(scene, boxWidth, MAX_HEIGHT_PX) : 1;
  const width = scene.width * scale;
  const height = scene.height * scale;

  const inputs: Inputs = { face, shots, max, scene, scale, width, height, onChange };
  const [gesture] = useState(() => new PlotGesture(inputs, (t, d) => {
    setTouch(t);
    setDragIndex(d);
  }));
  useEffect(() => {
    gesture.update(inputs);
  });

  const markerCm = (s: LogShot, i: number): Marker | null => {
    if (s.x === undefined || s.y === undefined) return null;
    const point = i === dragIndex && touch ? pickAt(face, scene, scale, touch.px, touch.py) : { spot: s.spot ?? 0, x: s.x, y: s.y };
    const spot = face.spots[Math.min(point.spot, face.spots.length - 1)];
    return { cx: spot.x + point.x * scene.radius, cy: -(spot.y + point.y * scene.radius), selected: s.id === selectedId };
  };
  const markers = shots.flatMap((s, i) => markerCm(s, i) ?? []);

  const picked = touch ? pickAt(face, scene, scale, touch.px, touch.py) : null;
  const preview = picked ? score(face, picked.x, picked.y) : null;
  const previewLabel = preview ? (preview.is_miss ? 'M' : preview.is_x ? 'X' : preview.value === null ? '' : String(preview.value)) : '';
  const place = touch ? magnifierPlacement(touch.px, touch.py, width, MAGNIFIER_PX, GAP_PX) : null;
  const half = MAGNIFIER_PX / (2 * scale * ZOOM);
  const centreX = touch ? scene.x0 + touch.px / scale : 0;
  const centreY = touch ? scene.y0 + touch.py / scale : 0;

  return (
    <View onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)} style={{ width: '100%', alignItems: 'center' }}>
      {boxWidth > 0 && (
        <View style={{ width, height }}>
          <FaceSvg
            face={face}
            view={{ x: scene.x0, y: scene.y0, w: scene.width, h: scene.height }}
            width={width}
            height={height}
            cmPerPx={1 / scale}
            markers={markers}
          />
          <View
            {...gesture.responder.panHandlers}
            style={[StyleSheet.absoluteFill, Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: 'crosshair' } as object) : null]}
          />
          {touch && place && (
            <View
              style={{
                position: 'absolute', left: place.left, top: place.top, width: MAGNIFIER_PX, height: MAGNIFIER_PX,
                borderRadius: MAGNIFIER_PX / 2, overflow: 'hidden', borderWidth: 2, borderColor: '#000', backgroundColor: '#fff',
                pointerEvents: 'none',
              }}>
              <FaceSvg
                face={face}
                view={{ x: centreX - half, y: centreY - half, w: 2 * half, h: 2 * half }}
                width={MAGNIFIER_PX}
                height={MAGNIFIER_PX}
                cmPerPx={1 / (scale * ZOOM)}
                markers={markers}
              />
              <View style={{ position: 'absolute', left: MAGNIFIER_PX / 2 - 0.5, top: 0, bottom: 0, width: 1, backgroundColor: '#ff00ff' }} />
              <View style={{ position: 'absolute', top: MAGNIFIER_PX / 2 - 0.5, left: 0, right: 0, height: 1, backgroundColor: '#ff00ff' }} />
              <View style={{ position: 'absolute', bottom: 4, alignSelf: 'center', backgroundColor: '#000', borderRadius: 10, paddingHorizontal: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{previewLabel || '·'}</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

