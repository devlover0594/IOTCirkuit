import { CATALOG_MAP } from '../data/catalog';
import {
  BoardConfig,
  BomItem,
  ComponentDef,
  NetConnection,
  PinDef,
  PlacedComponent,
  PointMm,
  RoutedBoard,
  TraceSegment,
  ViaPoint,
} from '../types/pcb';

function snap(val: number, grid = 1.27): number {
  return Math.round(val / grid) * grid;
}

export function getPinWorldPos(comp: PlacedComponent, pin: PinDef): PointMm {
  const def = CATALOG_MAP[comp.defId];
  if (!def) return { x: comp.xMm + pin.dx, y: comp.yMm + pin.dy };
  const w = def.widthMm;
  const h = def.heightMm;
  switch (comp.rotation) {
    case 90:
      return { x: comp.xMm + (h - pin.dy), y: comp.yMm + pin.dx };
    case 180:
      return { x: comp.xMm + (w - pin.dx), y: comp.yMm + (h - pin.dy) };
    case 270:
      return { x: comp.xMm + pin.dy, y: comp.yMm + (w - pin.dx) };
    default:
      return { x: comp.xMm + pin.dx, y: comp.yMm + pin.dy };
  }
}

export function getRotatedDims(def: ComponentDef, rotation: 0 | 90 | 180 | 270) {
  if (rotation === 90 || rotation === 270) {
    return { widthMm: def.heightMm, heightMm: def.widthMm };
  }
  return { widthMm: def.widthMm, heightMm: def.heightMm };
}

function getDesignatorPrefix(def: ComponentDef): string {
  switch (def.category) {
    case 'mcu':
      return 'U';
    case 'actuator':
      return def.id.includes('relay') ? 'K' : def.id.includes('buzzer') ? 'BZ' : 'Q';
    case 'sensor':
      return def.id.includes('oled') ? 'DSP' : 'S';
    case 'tactile':
      return def.id.includes('led') ? 'LED' : 'SW';
    case 'connector':
      return 'J';
    default:
      return 'X';
  }
}

export function autoPlaceComponents(
  componentIds: string[],
  boardWidthMm: number,
  boardHeightMm: number,
  pinOverridesList?: Array<Record<string, string> | undefined>
): PlacedComponent[] {
  const counts: Record<string, number> = {};
  const placed: PlacedComponent[] = [];

  const defsWithIdx = componentIds
    .map((id, idx) => ({ def: CATALOG_MAP[id], idx }))
    .filter((item): item is { def: ComponentDef; idx: number } => Boolean(item.def));

  const mcus = defsWithIdx.filter((d) => d.def.category === 'mcu');
  const connectors = defsWithIdx.filter((d) => d.def.category === 'connector');
  const actuators = defsWithIdx.filter((d) => d.def.category === 'actuator');
  const sensors = defsWithIdx.filter((d) => d.def.category === 'sensor');
  const tactiles = defsWithIdx.filter((d) => d.def.category === 'tactile');

  const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
  const margin = 7;
  const gap = 5;

  const overlaps = (x: number, y: number, w: number, h: number) => {
    for (const r of occupied) {
      if (x < r.x + r.w + gap && x + w + gap > r.x && y < r.y + r.h + gap && y + h + gap > r.y) {
        return true;
      }
    }
    return false;
  };

  const placeInZone = (
    def: ComponentDef,
    origIdx: number,
    prefX: number,
    prefY: number
  ) => {
    const prefix = getDesignatorPrefix(def);
    counts[prefix] = (counts[prefix] || 0) + 1;
    const designator = `${prefix}${counts[prefix]}`;

    let bestX = Math.max(margin, Math.min(boardWidthMm - def.widthMm - margin, prefX));
    let bestY = Math.max(margin, Math.min(boardHeightMm - def.heightMm - margin, prefY));

    if (overlaps(bestX, bestY, def.widthMm, def.heightMm)) {
      let found = false;
      for (let sy = margin; sy <= boardHeightMm - def.heightMm - margin; sy += 4) {
        for (let sx = margin; sx <= boardWidthMm - def.widthMm - margin; sx += 4) {
          if (!overlaps(sx, sy, def.widthMm, def.heightMm)) {
            bestX = sx;
            bestY = sy;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    bestX = snap(bestX, 1.27);
    bestY = snap(bestY, 1.27);
    occupied.push({ x: bestX, y: bestY, w: def.widthMm, h: def.heightMm });

    placed.push({
      uid: `${def.id}-${origIdx}-${Math.random().toString(36).slice(2, 6)}`,
      defId: def.id,
      designator,
      label: def.shortName,
      xMm: bestX,
      yMm: bestY,
      rotation: 0,
      pinOverrides: pinOverridesList?.[origIdx],
    });
  };

  // 1. Place MCU centered-left
  mcus.forEach((m, i) => {
    const px = i === 0 ? Math.max(margin + 12, boardWidthMm * 0.25 - m.def.widthMm / 2) : margin + i * 34;
    const py = Math.max(margin, (boardHeightMm - m.def.heightMm) / 2);
    placeInZone(m.def, m.idx, px, py);
  });

  // 2. Place Power/External Connectors along left edge
  connectors.forEach((c, i) => {
    placeInZone(c.def, c.idx, margin, margin + i * (c.def.heightMm + 6));
  });

  // 3. Place Actuators (Relays, Buzzer, MOSFET) on top-right
  let actY = margin;
  actuators.forEach((a) => {
    placeInZone(a.def, a.idx, boardWidthMm - a.def.widthMm - margin, actY);
    actY += a.def.heightMm + 6;
  });

  // 4. Place Sensors in mid-right / top-center
  let senX = boardWidthMm * 0.52;
  let senY = margin;
  sensors.forEach((s) => {
    if (senY + s.def.heightMm > boardHeightMm - 20) {
      senY = margin;
      senX += 24;
    }
    placeInZone(s.def, s.idx, senX, senY);
    senY += s.def.heightMm + 6;
  });

  // 5. Place Tactile Buttons & LEDs along bottom accessible edge
  let tacX = margin + 16;
  tactiles.forEach((t) => {
    placeInZone(t.def, t.idx, tacX, boardHeightMm - t.def.heightMm - margin);
    tacX += t.def.widthMm + 6;
  });

  return placed;
}

export function buildBom(placed: PlacedComponent[]): BomItem[] {
  const groups = new Map<string, BomItem>();

  for (const comp of placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;

    const key = def.id;
    const existing = groups.get(key);
    if (existing) {
      existing.designators.push(comp.designator);
      existing.qty += 1;
    } else {
      groups.set(key, {
        designators: [comp.designator],
        name: def.name,
        spec: def.voltage,
        footprint: def.footprint,
        qty: 1,
        category: def.category.toUpperCase(),
        note: def.description,
      });
    }

    if (def.supportParts) {
      def.supportParts.forEach((sp, spIdx) => {
        const spKey = `sp-${sp.name}-${sp.spec}`;
        const spDesignator = `${sp.designatorPrefix}(${comp.designator})`;
        const exSp = groups.get(spKey);
        if (exSp) {
          exSp.designators.push(spDesignator);
          exSp.qty += 1;
        } else {
          groups.set(`${spKey}-${spIdx === 0 ? '' : ''}`, {
            designators: [spDesignator],
            name: sp.name,
            spec: sp.spec,
            footprint: sp.footprint,
            qty: 1,
            category: 'PENDUKUNG',
            note: sp.note,
          });
        }
      });
    }
  }

  if (placed.length > 0) {
    groups.set('pcb-mounting', {
      designators: ['MH1–MH4'],
      name: 'Spacer & Baut PCB M3 Kuningan/Nylon',
      spec: 'M3 × 10mm',
      footprint: 'HOLE-3.2MM',
      qty: 4,
      category: 'MEKANIK',
      note: 'Untuk 4 lubang mounting sudut papan PCB',
    });
  }

  return Array.from(groups.values());
}

function buildMinimumSpanningTree(
  nodes: Array<{ comp: PlacedComponent; pin: PinDef; pos: PointMm }>,
  netName: string,
  netType: NetConnection['netType'],
  idPrefix: string
): NetConnection[] {
  if (nodes.length < 2) return [];
  const visited = new Set<number>([0]);
  const edges: NetConnection[] = [];

  while (visited.size < nodes.length) {
    let bestDist = Infinity;
    let bestFrom = 0;
    let bestTo = 0;

    for (const u of visited) {
      for (let v = 0; v < nodes.length; v++) {
        if (visited.has(v)) continue;
        const dx = nodes[u].pos.x - nodes[v].pos.x;
        const dy = nodes[u].pos.y - nodes[v].pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestFrom = u;
          bestTo = v;
        }
      }
    }

    visited.add(bestTo);
    const a = nodes[bestFrom];
    const b = nodes[bestTo];
    edges.push({
      id: `${idPrefix}-${edges.length}`,
      netName,
      netType,
      fromUid: a.comp.uid,
      fromPinId: a.pin.id,
      fromDesignator: a.comp.designator,
      fromPinLabel: a.pin.label,
      toUid: b.comp.uid,
      toPinId: b.pin.id,
      toDesignator: b.comp.designator,
      toPinLabel: b.pin.label,
    });
  }

  return edges;
}

export function routePcb(placed: PlacedComponent[], config: BoardConfig): RoutedBoard {
  const warnings: string[] = [];
  const connections: NetConnection[] = [];

  const mcus = placed.filter((p) => CATALOG_MAP[p.defId]?.category === 'mcu');
  const mainMcu = mcus[0];

  if (!mainMcu) {
    if (placed.length > 0) {
      warnings.push('Tambahkan Mikrokontroler (ESP32 / NodeMCU / Arduino Nano) agar jalur sinyal dapat dirute otomatis.');
    }
    return {
      placed,
      connections: [],
      traces: [],
      vias: [],
      bom: buildBom(placed),
      warnings,
    };
  }

  const mcuDef = CATALOG_MAP[mainMcu.defId];

  // Collect power & ground nodes across all placed components
  const gndNodes: Array<{ comp: PlacedComponent; pin: PinDef; pos: PointMm }> = [];
  const v5Nodes: Array<{ comp: PlacedComponent; pin: PinDef; pos: PointMm }> = [];
  const v33Nodes: Array<{ comp: PlacedComponent; pin: PinDef; pos: PointMm }> = [];
  const sdaNodes: Array<{ comp: PlacedComponent; pin: PinDef; pos: PointMm }> = [];
  const sclNodes: Array<{ comp: PlacedComponent; pin: PinDef; pos: PointMm }> = [];

  for (const comp of placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;
    for (const pin of def.pins) {
      const pos = getPinWorldPos(comp, pin);
      if (pin.type === 'gnd') {
        gndNodes.push({ comp, pin, pos });
      } else if (pin.type === 'power_5v') {
        v5Nodes.push({ comp, pin, pos });
      } else if (pin.type === 'power_3v3') {
        v33Nodes.push({ comp, pin, pos });
      } else if (pin.type === 'i2c_sda') {
        sdaNodes.push({ comp, pin, pos });
      } else if (pin.type === 'i2c_scl') {
        sclNodes.push({ comp, pin, pos });
      }
    }
  }

  // If MCU is 5V-only (Arduino Nano) and has 3V3 pin, 3V3 sensors can still connect to MCU 3V3
  connections.push(...buildMinimumSpanningTree(gndNodes, 'GND', 'gnd', 'gnd'));
  connections.push(...buildMinimumSpanningTree(v5Nodes, '+5V', 'power_5v', 'v5'));
  connections.push(...buildMinimumSpanningTree(v33Nodes, '+3V3', 'power_3v3', 'v33'));
  connections.push(...buildMinimumSpanningTree(sdaNodes, 'I2C_SDA', 'i2c', 'sda'));
  connections.push(...buildMinimumSpanningTree(sclNodes, 'I2C_SCL', 'i2c', 'scl'));

  // Track used MCU GPIO pins
  const usedMcuPinIds = new Set<string>();
  for (const p of mcuDef.pins) {
    if (p.type === 'i2c_sda' && sdaNodes.length > 1) usedMcuPinIds.add(p.id);
    if (p.type === 'i2c_scl' && sclNodes.length > 1) usedMcuPinIds.add(p.id);
  }

  // Sort preferred MCU pins for clean routing (avoid boot/strapping/flash pins first)
  const mcuSignalPins = mcuDef.pins.filter(
    (p) => p.type === 'gpio' || p.type === 'adc' || p.type === 'pwm'
  );

  const pickMcuPin = (
    reqType: PinDef['type'],
    overridePin?: string
  ): PinDef | undefined => {
    if (overridePin) {
      const clean = overridePin.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      const matched = mcuSignalPins.find(
        (p) =>
          p.id.toUpperCase() === clean ||
          String(p.gpioNum ?? '') === clean.replace(/^D|^GPIO/, '') ||
          p.label.toUpperCase().includes(clean)
      );
      if (matched && !usedMcuPinIds.has(matched.id)) {
        usedMcuPinIds.add(matched.id);
        return matched;
      }
    }

    const candidates = mcuSignalPins.filter((p) => !usedMcuPinIds.has(p.id));
    if (candidates.length === 0) return undefined;

    let chosen: PinDef | undefined;
    if (reqType === 'adc') {
      chosen =
        candidates.find((p) => p.isAnalogCapable) ??
        candidates.find((p) => p.type === 'adc');
    } else if (reqType === 'pwm') {
      chosen =
        candidates.find((p) => p.isPwmCapable && !p.isInputOnly) ??
        candidates.find((p) => !p.isInputOnly);
    } else {
      chosen =
        candidates.find((p) => !p.isInputOnly && p.gpioNum !== 1 && p.gpioNum !== 3) ??
        candidates[0];
    }

    if (chosen) {
      usedMcuPinIds.add(chosen.id);
    }
    return chosen;
  };

  // Connect all non-MCU signal pins
  let sigIdx = 0;
  for (const comp of placed) {
    if (comp.uid === mainMcu.uid) continue;
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;

    for (const pin of def.pins) {
      if (
        pin.type === 'gnd' ||
        pin.type === 'power_5v' ||
        pin.type === 'power_3v3' ||
        pin.type === 'i2c_sda' ||
        pin.type === 'i2c_scl' ||
        pin.type === 'load'
      ) {
        continue;
      }

      const override = comp.pinOverrides?.[pin.id];
      const mcuPin = pickMcuPin(pin.type, override);
      if (!mcuPin) {
        warnings.push(`Pin GPIO pada ${mainMcu.designator} tidak cukup untuk ${comp.designator}.${pin.label}.`);
        continue;
      }

      const netName = `${comp.designator}_${pin.label.replace(/\s+/g, '')}`;
      connections.push({
        id: `sig-${sigIdx++}`,
        netName,
        netType: pin.type === 'adc' ? 'adc' : 'signal',
        fromUid: mainMcu.uid,
        fromPinId: mcuPin.id,
        fromDesignator: mainMcu.designator,
        fromPinLabel: mcuPin.label,
        toUid: comp.uid,
        toPinId: pin.id,
        toDesignator: comp.designator,
        toPinLabel: pin.label,
      });
    }
  }

  // Generate Orthogonal + 45-degree chamfered PCB Copper Traces
  const traces: TraceSegment[] = [];
  const vias: ViaPoint[] = [];
  const placedMap = new Map(placed.map((p) => [p.uid, p]));

  connections.forEach((conn, idx) => {
    const fromComp = placedMap.get(conn.fromUid);
    const toComp = placedMap.get(conn.toUid);
    if (!fromComp || !toComp) return;

    const fromPin = CATALOG_MAP[fromComp.defId]?.pins.find((p) => p.id === conn.fromPinId);
    const toPin = CATALOG_MAP[toComp.defId]?.pins.find((p) => p.id === conn.toPinId);
    if (!fromPin || !toPin) return;

    const p1 = getPinWorldPos(fromComp, fromPin);
    const p2 = getPinWorldPos(toComp, toPin);

    const isPower = conn.netType === 'power_5v' || conn.netType === 'power_3v3' || conn.netType === 'gnd';
    const traceWidth = isPower ? Math.max(config.traceWidthMm, 0.8) : config.traceWidthMm;

    // Channel lane offset prevents parallel tracks from overlapping identically
    const laneOffset = ((idx % 7) - 3) * 1.4;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const points: PointMm[] = [p1];

    if (Math.abs(dx) < 0.2 || Math.abs(dy) < 0.2) {
      points.push(p2);
    } else {
      const midX = snap(p1.x + dx * 0.5 + laneOffset, 0.5);
      const clampedMidX = Math.max(3, Math.min(config.widthMm - 3, midX));
      const chamfer = Math.min(1.6, Math.abs(clampedMidX - p1.x) * 0.35, Math.abs(dy) * 0.35);

      const signX = clampedMidX >= p1.x ? 1 : -1;
      const signY = dy >= 0 ? 1 : -1;

      if (chamfer > 0.3) {
        points.push({ x: clampedMidX - signX * chamfer, y: p1.y });
        points.push({ x: clampedMidX, y: p1.y + signY * chamfer });
        points.push({ x: clampedMidX, y: p2.y - signY * chamfer });
        points.push({ x: clampedMidX + (p2.x >= clampedMidX ? 1 : -1) * chamfer, y: p2.y });
      } else {
        points.push({ x: clampedMidX, y: p1.y });
        points.push({ x: clampedMidX, y: p2.y });
      }
      points.push(p2);
    }

    if (config.copperMode === '1-layer') {
      traces.push({
        id: `tr-${idx}`,
        netName: conn.netName,
        netType: conn.netType,
        layer: 'B.Cu',
        widthMm: traceWidth,
        points,
      });
    } else {
      // 2-Layer PCB: route GND/Power predominantly on B.Cu and split signal crossings with a via
      const useTwoSegmentsWithVia = !isPower && points.length >= 4 && idx % 2 === 1;
      if (useTwoSegmentsWithVia) {
        const splitIdx = Math.floor(points.length / 2);
        const viaPt = points[splitIdx];
        traces.push({
          id: `tr-${idx}-a`,
          netName: conn.netName,
          netType: conn.netType,
          layer: 'F.Cu',
          widthMm: traceWidth,
          points: points.slice(0, splitIdx + 1),
        });
        traces.push({
          id: `tr-${idx}-b`,
          netName: conn.netName,
          netType: conn.netType,
          layer: 'B.Cu',
          widthMm: traceWidth,
          points: points.slice(splitIdx),
        });
        vias.push({
          id: `via-${idx}`,
          xMm: viaPt.x,
          yMm: viaPt.y,
          drillMm: 0.4,
          padMm: 0.9,
          netName: conn.netName,
        });
      } else {
        traces.push({
          id: `tr-${idx}`,
          netName: conn.netName,
          netType: conn.netType,
          layer: isPower ? 'B.Cu' : 'F.Cu',
          widthMm: traceWidth,
          points,
        });
      }
    }
  });

  return {
    placed,
    connections,
    traces,
    vias,
    bom: buildBom(placed),
    warnings,
  };
}
