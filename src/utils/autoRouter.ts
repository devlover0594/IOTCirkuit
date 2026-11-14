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
  TraceConflict,
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

  // Route traces using candidate paths + Grid A* fallback
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

    const isPower =
      conn.netType === 'power_5v' || conn.netType === 'power_3v3' || conn.netType === 'gnd';
    const traceWidth = isPower ? Math.max(config.traceWidthMm, 0.8) : config.traceWidthMm;
    const cands = buildRouteCandidates(p1, p2, idx, config.widthMm, config.heightMm);

    if (config.copperMode === '1-layer') {
      let best = pickBestCandidate(cands, traces, 'B.Cu', conn.netName);
      if (best.conflicts > 0) {
        const aStarPts = findAStarTracePath(p1, p2, traces, placed, 'B.Cu', conn.netName, config);
        if (aStarPts) {
          const aStarConf = countTraceLayerConflicts(aStarPts, traces, 'B.Cu', conn.netName);
          if (aStarConf < best.conflicts) {
            best = { pts: aStarPts, conflicts: aStarConf };
          }
        }
      }
      if (best.conflicts > 0) {
        warnings.push(
          `Jalur ${conn.netName} masih bersilangan di mode 1-Layer: gunakan kawat jumper atau aktifkan mode Dual Layer.`
        );
      }
      traces.push({
        id: `tr-${idx}`,
        netName: conn.netName,
        netType: conn.netType,
        layer: 'B.Cu',
        widthMm: traceWidth,
        points: best.pts,
      });
    } else {
      const primaryLayer: 'F.Cu' | 'B.Cu' = isPower ? 'B.Cu' : 'F.Cu';
      const secondaryLayer: 'F.Cu' | 'B.Cu' = primaryLayer === 'F.Cu' ? 'B.Cu' : 'F.Cu';

      let primaryAttempt = pickBestCandidate(cands, traces, primaryLayer, conn.netName);
      if (primaryAttempt.conflicts > 0) {
        const aStarPrimary = findAStarTracePath(p1, p2, traces, placed, primaryLayer, conn.netName, config);
        if (aStarPrimary) {
          const c = countTraceLayerConflicts(aStarPrimary, traces, primaryLayer, conn.netName);
          if (c < primaryAttempt.conflicts) {
            primaryAttempt = { pts: aStarPrimary, conflicts: c };
          }
        }
      }

      if (primaryAttempt.conflicts === 0) {
        traces.push({
          id: `tr-${idx}`,
          netName: conn.netName,
          netType: conn.netType,
          layer: primaryLayer,
          widthMm: traceWidth,
          points: primaryAttempt.pts,
        });
      } else {
        let secondaryAttempt = pickBestCandidate(cands, traces, secondaryLayer, conn.netName);
        if (secondaryAttempt.conflicts > 0) {
          const aStarSec = findAStarTracePath(p1, p2, traces, placed, secondaryLayer, conn.netName, config);
          if (aStarSec) {
            const c = countTraceLayerConflicts(aStarSec, traces, secondaryLayer, conn.netName);
            if (c < secondaryAttempt.conflicts) {
              secondaryAttempt = { pts: aStarSec, conflicts: c };
            }
          }
        }

        if (secondaryAttempt.conflicts === 0) {
          traces.push({
            id: `tr-${idx}`,
            netName: conn.netName,
            netType: conn.netType,
            layer: secondaryLayer,
            widthMm: traceWidth,
            points: secondaryAttempt.pts,
          });
        } else if (primaryAttempt.pts.length >= 4) {
          const splitIdx = Math.floor(primaryAttempt.pts.length / 2);
          const viaPt = primaryAttempt.pts[splitIdx];
          traces.push({
            id: `tr-${idx}-a`,
            netName: conn.netName,
            netType: conn.netType,
            layer: primaryLayer,
            widthMm: traceWidth,
            points: primaryAttempt.pts.slice(0, splitIdx + 1),
          });
          traces.push({
            id: `tr-${idx}-b`,
            netName: conn.netName,
            netType: conn.netType,
            layer: secondaryLayer,
            widthMm: traceWidth,
            points: primaryAttempt.pts.slice(splitIdx),
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
          const useSec = secondaryAttempt.conflicts < primaryAttempt.conflicts;
          traces.push({
            id: `tr-${idx}`,
            netName: conn.netName,
            netType: conn.netType,
            layer: useSec ? secondaryLayer : primaryLayer,
            widthMm: traceWidth,
            points: useSec ? secondaryAttempt.pts : primaryAttempt.pts,
          });
        }
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

// ================= GEOMETRY, A* PATHFINDER & CONFLICT RESOLVER =================

function ccw(a: PointMm, b: PointMm, c: PointMm): boolean {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

function samePoint(a: PointMm, b: PointMm, tol = 0.35): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

function segDist(a: PointMm, b: PointMm, p: PointMm): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

function getIntersectionPoint(a1: PointMm, a2: PointMm, b1: PointMm, b2: PointMm): PointMm | null {
  const denom = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(denom) < 1e-6) {
    // Parallel close segments — return midpoint of closest endpoints
    return { x: (a1.x + a2.x + b1.x + b2.x) / 4, y: (a1.y + a2.y + b1.y + b2.y) / 4 };
  }
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / denom;
  const u = -((a1.x - a2.x) * (a1.y - b1.y) - (a1.y - a2.y) * (a1.x - b1.x)) / denom;
  if (t >= -0.02 && t <= 1.02 && u >= -0.02 && u <= 1.02) {
    return {
      x: a1.x + t * (a2.x - a1.x),
      y: a1.y + t * (a2.y - a1.y),
    };
  }
  return { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
}

function segmentsConflict(a1: PointMm, a2: PointMm, b1: PointMm, b2: PointMm): boolean {
  if (
    samePoint(a1, b1) ||
    samePoint(a1, b2) ||
    samePoint(a2, b1) ||
    samePoint(a2, b2)
  ) {
    return false;
  }
  const intersects =
    ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
  if (intersects) return true;

  const minD = Math.min(
    segDist(a1, a2, b1),
    segDist(a1, a2, b2),
    segDist(b1, b2, a1),
    segDist(b1, b2, a2)
  );
  return minD < 0.65;
}

function makeChamferedMidX(p1: PointMm, p2: PointMm, midXRaw: number, boardW: number): PointMm[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.abs(dx) < 0.2 || Math.abs(dy) < 0.2) return [p1, p2];
  const clampedMidX = Math.max(2.5, Math.min(boardW - 2.5, snap(midXRaw, 0.5)));
  const chamfer = Math.min(1.5, Math.abs(clampedMidX - p1.x) * 0.35, Math.abs(dy) * 0.35);
  const signX = clampedMidX >= p1.x ? 1 : -1;
  const signY = dy >= 0 ? 1 : -1;
  const pts: PointMm[] = [p1];
  if (chamfer > 0.3) {
    pts.push({ x: clampedMidX - signX * chamfer, y: p1.y });
    pts.push({ x: clampedMidX, y: p1.y + signY * chamfer });
    pts.push({ x: clampedMidX, y: p2.y - signY * chamfer });
    pts.push({ x: clampedMidX + (p2.x >= clampedMidX ? 1 : -1) * chamfer, y: p2.y });
  } else {
    pts.push({ x: clampedMidX, y: p1.y });
    pts.push({ x: clampedMidX, y: p2.y });
  }
  pts.push(p2);
  return pts;
}

function makeChamferedMidY(p1: PointMm, p2: PointMm, midYRaw: number, boardH: number): PointMm[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.abs(dx) < 0.2 || Math.abs(dy) < 0.2) return [p1, p2];
  const clampedMidY = Math.max(2.5, Math.min(boardH - 2.5, snap(midYRaw, 0.5)));
  const chamfer = Math.min(1.5, Math.abs(dx) * 0.35, Math.abs(clampedMidY - p1.y) * 0.35);
  const signX = dx >= 0 ? 1 : -1;
  const signY = clampedMidY >= p1.y ? 1 : -1;
  const pts: PointMm[] = [p1];
  if (chamfer > 0.3) {
    pts.push({ x: p1.x, y: clampedMidY - signY * chamfer });
    pts.push({ x: p1.x + signX * chamfer, y: clampedMidY });
    pts.push({ x: p2.x - signX * chamfer, y: clampedMidY });
    pts.push({ x: p2.x, y: clampedMidY + (p2.y >= clampedMidY ? 1 : -1) * chamfer });
  } else {
    pts.push({ x: p1.x, y: clampedMidY });
    pts.push({ x: p2.x, y: clampedMidY });
  }
  pts.push(p2);
  return pts;
}

function buildRouteCandidates(
  p1: PointMm,
  p2: PointMm,
  idx: number,
  boardW: number,
  boardH: number
): PointMm[][] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const baseLane = ((idx % 5) - 2) * 1.6;
  const cands: PointMm[][] = [];

  for (const off of [0, 1.8, -1.8, 3.8, -3.8, 6.5, -6.5]) {
    cands.push(makeChamferedMidX(p1, p2, p1.x + dx * 0.5 + baseLane + off, boardW));
  }
  for (const off of [0, 2.0, -2.0, 4.5, -4.5]) {
    cands.push(makeChamferedMidY(p1, p2, p1.y + dy * 0.5 + baseLane + off, boardH));
  }
  cands.push([p1, { x: p2.x, y: p1.y }, p2]);
  cands.push([p1, { x: p1.x, y: p2.y }, p2]);
  cands.push(makeChamferedMidY(p1, p2, 3.8, boardH));
  cands.push(makeChamferedMidY(p1, p2, boardH - 3.8, boardH));
  cands.push(makeChamferedMidX(p1, p2, 3.8, boardW));
  cands.push(makeChamferedMidX(p1, p2, boardW - 3.8, boardW));

  return cands;
}

function countTraceLayerConflicts(
  pts: PointMm[],
  existingTraces: TraceSegment[],
  layer: 'F.Cu' | 'B.Cu',
  netName: string,
  ignoreTraceId?: string
): number {
  let conflicts = 0;
  const existing = existingTraces.filter(
    (t) => t.layer === layer && t.netName !== netName && t.id !== ignoreTraceId
  );
  for (let i = 0; i < pts.length - 1; i++) {
    const a1 = pts[i];
    const a2 = pts[i + 1];
    for (const ex of existing) {
      for (let j = 0; j < ex.points.length - 1; j++) {
        if (segmentsConflict(a1, a2, ex.points[j], ex.points[j + 1])) {
          conflicts++;
        }
      }
    }
  }
  return conflicts;
}

function pickBestCandidate(
  cands: PointMm[][],
  existingTraces: TraceSegment[],
  layer: 'F.Cu' | 'B.Cu',
  netName: string,
  ignoreTraceId?: string
): { pts: PointMm[]; conflicts: number } {
  let bestPts = cands[0];
  let bestConflicts = Infinity;
  for (const cand of cands) {
    const c = countTraceLayerConflicts(cand, existingTraces, layer, netName, ignoreTraceId);
    if (c === 0) return { pts: cand, conflicts: 0 };
    if (c < bestConflicts) {
      bestConflicts = c;
      bestPts = cand;
    }
  }
  return { pts: bestPts, conflicts: bestConflicts };
}

function findAStarTracePath(
  p1: PointMm,
  p2: PointMm,
  existingTraces: TraceSegment[],
  placed: PlacedComponent[],
  layer: 'F.Cu' | 'B.Cu',
  netName: string,
  config: BoardConfig,
  ignoreTraceId?: string
): PointMm[] | null {
  const step = 1.5;
  const cols = Math.max(10, Math.floor(config.widthMm / step) + 1);
  const rows = Math.max(10, Math.floor(config.heightMm / step) + 1);

  const toCell = (pt: PointMm) => ({
    gx: Math.max(1, Math.min(cols - 2, Math.round(pt.x / step))),
    gy: Math.max(1, Math.min(rows - 2, Math.round(pt.y / step))),
  });

  const start = toCell(p1);
  const goal = toCell(p2);

  // Build obstacle bitmap for pads & existing same-layer traces
  const blocked = new Uint8Array(cols * rows);
  const activeLayerTraces = existingTraces.filter(
    (t) => t.layer === layer && t.netName !== netName && t.id !== ignoreTraceId
  );

  for (const tr of activeLayerTraces) {
    for (let i = 0; i < tr.points.length - 1; i++) {
      const a = tr.points[i];
      const b = tr.points[i + 1];
      const minGx = Math.max(0, Math.floor(Math.min(a.x, b.x) / step) - 1);
      const maxGx = Math.min(cols - 1, Math.ceil(Math.max(a.x, b.x) / step) + 1);
      const minGy = Math.max(0, Math.floor(Math.min(a.y, b.y) / step) - 1);
      const maxGy = Math.min(rows - 1, Math.ceil(Math.max(a.y, b.y) / step) + 1);
      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          const pt = { x: gx * step, y: gy * step };
          if (segDist(a, b, pt) < 0.95) {
            blocked[gy * cols + gx] = 1;
          }
        }
      }
    }
  }

  for (const comp of placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;
    for (const pin of def.pins) {
      const pos = getPinWorldPos(comp, pin);
      if (samePoint(pos, p1, 1.3) || samePoint(pos, p2, 1.3)) continue;
      const c = toCell(pos);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = c.gx + dx;
          const ny = c.gy + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            const pt = { x: nx * step, y: ny * step };
            if (Math.hypot(pt.x - pos.x, pt.y - pos.y) < pin.padMm / 2 + 0.55) {
              blocked[ny * cols + nx] = 1;
            }
          }
        }
      }
    }
  }

  // Ensure start & goal cells remain open
  blocked[start.gy * cols + start.gx] = 0;
  blocked[goal.gy * cols + goal.gx] = 0;

  const startIdx = start.gy * cols + start.gx;
  const goalIdx = goal.gy * cols + goal.gx;

  const gScore = new Float32Array(cols * rows).fill(Infinity);
  const parent = new Int32Array(cols * rows).fill(-1);
  const dirTaken = new Int8Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);

  gScore[startIdx] = 0;
  const open: Array<{ idx: number; f: number }> = [
    { idx: startIdx, f: Math.abs(goal.gx - start.gx) + Math.abs(goal.gy - start.gy) },
  ];

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let found = false;
  let iterations = 0;
  const maxIterations = cols * rows * 2;

  while (open.length > 0 && iterations++ < maxIterations) {
    // Pop lowest f
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestI].f) bestI = i;
    }
    const cur = open.splice(bestI, 1)[0];
    if (cur.idx === goalIdx) {
      found = true;
      break;
    }
    if (closed[cur.idx]) continue;
    closed[cur.idx] = 1;

    const cx = cur.idx % cols;
    const cy = Math.floor(cur.idx / cols);

    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx <= 0 || nx >= cols - 1 || ny <= 0 || ny >= rows - 1) continue;
      const nIdx = ny * cols + nx;
      if (closed[nIdx] || blocked[nIdx]) continue;

      const turnPenalty = dirTaken[cur.idx] !== -1 && dirTaken[cur.idx] !== d ? 0.35 : 0;
      const tentativeG = gScore[cur.idx] + 1 + turnPenalty;
      if (tentativeG < gScore[nIdx]) {
        parent[nIdx] = cur.idx;
        dirTaken[nIdx] = d;
        gScore[nIdx] = tentativeG;
        const h = Math.abs(goal.gx - nx) + Math.abs(goal.gy - ny);
        open.push({ idx: nIdx, f: tentativeG + h });
      }
    }
  }

  if (!found) return null;

  // Reconstruct grid points
  const rawPts: PointMm[] = [];
  let traceIdx = goalIdx;
  while (traceIdx !== -1 && traceIdx !== startIdx) {
    const gx = traceIdx % cols;
    const gy = Math.floor(traceIdx / cols);
    rawPts.push({ x: Number((gx * step).toFixed(2)), y: Number((gy * step).toFixed(2)) });
    traceIdx = parent[traceIdx];
  }
  rawPts.reverse();

  const fullPts: PointMm[] = [p1, ...rawPts.slice(1, -1), p2];
  // Prune collinear points for clean crisp vectors
  const pruned: PointMm[] = [fullPts[0]];
  for (let i = 1; i < fullPts.length - 1; i++) {
    const prev = pruned[pruned.length - 1];
    const curr = fullPts[i];
    const next = fullPts[i + 1];
    const colX = Math.abs(prev.x - curr.x) < 0.05 && Math.abs(curr.x - next.x) < 0.05;
    const colY = Math.abs(prev.y - curr.y) < 0.05 && Math.abs(curr.y - next.y) < 0.05;
    if (!colX && !colY) {
      pruned.push(curr);
    }
  }
  pruned.push(fullPts[fullPts.length - 1]);
  return pruned;
}

export function detectTraceConflicts(traces: TraceSegment[]): TraceConflict[] {
  const conflicts: TraceConflict[] = [];
  const seenPairs = new Set<string>();

  for (let i = 0; i < traces.length; i++) {
    const ta = traces[i];
    if (ta.points.length < 2) continue;

    for (let j = i + 1; j < traces.length; j++) {
      const tb = traces[j];
      if (tb.points.length < 2) continue;
      if (ta.layer !== tb.layer || ta.netName === tb.netName) continue;

      let hitPoint: PointMm | null = null;
      for (let sa = 0; sa < ta.points.length - 1 && !hitPoint; sa++) {
        for (let sb = 0; sb < tb.points.length - 1; sb++) {
          if (segmentsConflict(ta.points[sa], ta.points[sa + 1], tb.points[sb], tb.points[sb + 1])) {
            hitPoint = getIntersectionPoint(
              ta.points[sa],
              ta.points[sa + 1],
              tb.points[sb],
              tb.points[sb + 1]
            );
            break;
          }
        }
      }

      if (hitPoint) {
        const key = `${ta.id}::${tb.id}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          conflicts.push({
            id: `conf-${conflicts.length}`,
            xMm: Number(hitPoint.x.toFixed(2)),
            yMm: Number(hitPoint.y.toFixed(2)),
            layer: ta.layer,
            traceAId: ta.id,
            traceBId: tb.id,
            netA: ta.netName,
            netB: tb.netName,
          });
        }
      }
    }
  }

  return conflicts;
}

export function resolveTraceConflicts(
  traces: TraceSegment[],
  vias: ViaPoint[],
  placed: PlacedComponent[],
  config: BoardConfig
): { traces: TraceSegment[]; vias: ViaPoint[]; remainingConflicts: TraceConflict[]; fixedCount: number } {
  let workingTraces = traces.map((t) => ({ ...t, points: [...t.points] }));
  const workingVias = [...vias];
  let fixedCount = 0;

  // Up to 3 passes to resolve cascading or two-sided conflicts cleanly
  for (let pass = 0; pass < 3; pass++) {
    const currentConflicts = detectTraceConflicts(workingTraces);
    if (currentConflicts.length === 0) break;

    const conflictingIds = new Set<string>();
    for (const c of currentConflicts) {
      conflictingIds.add(c.traceBId);
      if (pass >= 1) {
        conflictingIds.add(c.traceAId);
      }
    }

    for (const tid of conflictingIds) {
      const tIdx = workingTraces.findIndex((t) => t.id === tid);
      if (tIdx === -1) continue;
      const tr = workingTraces[tIdx];
      if (tr.points.length < 2) continue;

      const p1 = tr.points[0];
      const p2 = tr.points[tr.points.length - 1];
      const others = workingTraces.filter((_, i) => i !== tIdx);
      const currentConf = countTraceLayerConflicts(tr.points, others, tr.layer, tr.netName);
      if (currentConf === 0) continue;

      const cands = buildRouteCandidates(p1, p2, tIdx, config.widthMm, config.heightMm);

      // 1. Try clean orthogonal candidate or A* on current layer
      const sameLayerCand = pickBestCandidate(cands, others, tr.layer, tr.netName);
      if (sameLayerCand.conflicts === 0) {
        workingTraces[tIdx] = { ...tr, points: sameLayerCand.pts };
        fixedCount++;
        continue;
      }

      const aStarSame = findAStarTracePath(p1, p2, others, placed, tr.layer, tr.netName, config);
      if (aStarSame && countTraceLayerConflicts(aStarSame, others, tr.layer, tr.netName) === 0) {
        workingTraces[tIdx] = { ...tr, points: aStarSame };
        fixedCount++;
        continue;
      }

      // 2. If 2-layer mode, move trace cleanly to opposite layer (or A* on opposite layer)
      if (config.copperMode === '2-layer') {
        const oppLayer: 'F.Cu' | 'B.Cu' = tr.layer === 'F.Cu' ? 'B.Cu' : 'F.Cu';
        const oppCand = pickBestCandidate(cands, others, oppLayer, tr.netName);
        if (oppCand.conflicts === 0) {
          workingTraces[tIdx] = { ...tr, layer: oppLayer, points: oppCand.pts };
          fixedCount++;
          continue;
        }
        const aStarOpp = findAStarTracePath(p1, p2, others, placed, oppLayer, tr.netName, config);
        if (aStarOpp && countTraceLayerConflicts(aStarOpp, others, oppLayer, tr.netName) === 0) {
          workingTraces[tIdx] = { ...tr, layer: oppLayer, points: aStarOpp };
          fixedCount++;
          continue;
        }
      }
    }
  }

  return {
    traces: workingTraces,
    vias: workingVias,
    remainingConflicts: detectTraceConflicts(workingTraces),
    fixedCount,
  };
}
