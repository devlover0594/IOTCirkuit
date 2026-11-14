import { CATALOG_MAP, COMPONENT_CATALOG } from '../data/catalog';
import { BoardConfig, NetConnection, PlacedComponent } from '../types/pcb';
import { autoPlaceComponents } from './autoRouter';

export interface DiagramImportResult {
  projectName?: string;
  boardWidthMm?: number;
  boardHeightMm?: number;
  copperMode?: BoardConfig['copperMode'];
  placed: PlacedComponent[];
  summary: string[];
}

function matchCatalogId(rawText: string): string | null {
  const txt = rawText.toLowerCase().trim();
  if (CATALOG_MAP[txt]) return txt;

  const rules: Array<{ patterns: RegExp; id: string }> = [
    { patterns: /esp32|devkit/i, id: 'esp32-devkit' },
    { patterns: /esp8266|nodemcu/i, id: 'esp8266-nodemcu' },
    { patterns: /arduino|nano|atmega/i, id: 'arduino-nano' },
    { patterns: /relay.*2|2.*ch|2ch/i, id: 'relay-2ch' },
    { patterns: /relay|pompa|pump|lampu|lamp/i, id: 'relay-1ch' },
    { patterns: /dht22|dht11|\bdht\b/i, id: 'dht22' },
    { patterns: /bme280|bmp280|\bbme\b/i, id: 'bme280' },
    { patterns: /oled|ssd1306|display|layar/i, id: 'oled-ssd1306' },
    { patterns: /hcsr04|hc-sr04|ultrasoni|jarak/i, id: 'hcsr04' },
    { patterns: /pir|hcsr501|hc-sr501|gerak|motion/i, id: 'pir-hcsr501' },
    { patterns: /soil|tanah|moisture|ldr/i, id: 'soil-moisture' },
    { patterns: /mq-?2|mq-?135|gas|asap/i, id: 'mq2-gas' },
    { patterns: /ds18b20|1-wire|onewire/i, id: 'ds18b20' },
    { patterns: /buzzer|alarm|piezo|speaker/i, id: 'buzzer-5v' },
    { patterns: /mosfet|irlz44/i, id: 'mosfet-irlz44n' },
    { patterns: /rotary|ec11|encoder/i, id: 'rotary-ec11' },
    { patterns: /tactile|button|tombol|\bbtn\b|switch/i, id: 'tactile-btn' },
    { patterns: /\bled\b|indikator/i, id: 'led-5mm' },
    { patterns: /jst|jst-xh/i, id: 'jst-4p' },
    { patterns: /barrel|dc_jack|adaptor/i, id: 'barrel-dc' },
    { patterns: /term.*3|3p|3-pin/i, id: 'term-3p' },
    { patterns: /term|kf301|power|catu|5v|psu|terminal/i, id: 'term-2p' },
  ];

  for (const r of rules) {
    if (r.patterns.test(txt)) return r.id;
  }
  return null;
}

export function parseMermaidToPcb(
  script: string,
  boardWidthMm: number,
  boardHeightMm: number
): DiagramImportResult {
  const lines = script
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%') && !l.startsWith('classDef') && !l.startsWith('flowchart') && !l.startsWith('graph') && !l.startsWith('subgraph') && l !== 'end');

  const nodeLabels = new Map<string, string>();
  const nodeCatalogMap = new Map<string, string>();
  const nodePinOverrides = new Map<string, Record<string, string>>();

  const registerNode = (rawId: string, label?: string) => {
    const id = rawId.trim().replace(/["'`]/g, '');
    if (!id || id === 'EMPTY') return;
    const cleanLabel = (label ?? id).replace(/["'`]/g, '').trim();
    if (!nodeLabels.has(id) || label) {
      nodeLabels.set(id, cleanLabel);
    }
    if (!nodeCatalogMap.has(id)) {
      const matched = matchCatalogId(`${id} ${cleanLabel}`);
      if (matched) {
        nodeCatalogMap.set(id, matched);
      }
    }
  };

  // Parse node definitions & edges
  // Examples:
  // U1{{"U1: ESP32 DevKit (3.3V-5V)"}}:::mcu
  // K1["K1: Relay 1-CH"]:::actuator
  // S1 -->|"DATA -> GPIO4"| U1
  // ESP32 -->|GPIO26| Relay
  const nodePattern = /([A-Za-z0-9_]+)\s*(?:\{\{"?([^"}]+)"?\}\}|\["?([^"\]]+)"?\]|\("?([^")]+)"?\))?/g;
  const edgePattern = /^([A-Za-z0-9_]+)(?:[^-\n]*?)\s*(?:-->|---|-\.-|==>)\s*(?:\|"([^"]*)"\||\|([^|]*)\|)?\s*([A-Za-z0-9_]+)/;

  for (const line of lines) {
    const cleanLine = line.replace(/:::[A-Za-z0-9_]+/g, '').trim();
    const edgeMatch = cleanLine.match(edgePattern);
    if (edgeMatch) {
      const fromId = edgeMatch[1];
      const edgeText = (edgeMatch[2] || edgeMatch[3] || '').trim();
      const toId = edgeMatch[4];
      registerNode(fromId);
      registerNode(toId);

      // Extract pin mappings from edge text (e.g. "GPIO26 -> IN" or "DATA -> GPIO4" or "GPIO13")
      if (edgeText && !/^(5V|3\.3V|3V3|GND|SDA|SCL)$/i.test(edgeText)) {
        const gpioMatch = edgeText.match(/(?:GPIO\s*\d+|D\d+|A\d+)/i);
        if (gpioMatch) {
          const pinVal = gpioMatch[0].replace(/\s+/g, '').toUpperCase();
          const fromCat = nodeCatalogMap.get(fromId);
          const toCat = nodeCatalogMap.get(toId);
          const fromDef = fromCat ? CATALOG_MAP[fromCat] : undefined;
          const toDef = toCat ? CATALOG_MAP[toCat] : undefined;

          const targetNodeId =
            fromDef?.category === 'mcu' ? toId : toDef?.category === 'mcu' ? fromId : toId;
          const targetCat = nodeCatalogMap.get(targetNodeId);
          const targetDef = targetCat ? CATALOG_MAP[targetCat] : undefined;

          if (targetDef && targetDef.category !== 'mcu') {
            const sigPins = targetDef.pins.filter(
              (p) => p.type === 'gpio' || p.type === 'adc' || p.type === 'pwm'
            );
            // Match specific peripheral pin label if mentioned in edge text
            const matchedPerPin =
              sigPins.find((p) => edgeText.toUpperCase().includes(p.label.toUpperCase())) ??
              sigPins[0];
            if (matchedPerPin) {
              const prev = nodePinOverrides.get(targetNodeId) ?? {};
              prev[matchedPerPin.id] = pinVal;
              nodePinOverrides.set(targetNodeId, prev);
            }
          }
        }
      }
      continue;
    }

    // Standalone node declaration
    let nm: RegExpExecArray | null;
    nodePattern.lastIndex = 0;
    while ((nm = nodePattern.exec(cleanLine)) !== null) {
      if (!nm[1]) continue;
      const lbl = nm[2] || nm[3] || nm[4];
      registerNode(nm[1], lbl);
    }
  }

  const componentIds: string[] = [];
  const pinOverridesList: Array<Record<string, string> | undefined> = [];
  const summary: string[] = [];

  for (const [nodeId, defId] of nodeCatalogMap.entries()) {
    componentIds.push(defId);
    const ov = nodePinOverrides.get(nodeId);
    pinOverridesList.push(ov);
    const def = CATALOG_MAP[defId];
    const ovStr = ov
      ? ` (${Object.entries(ov)
          .map(([k, v]) => `${k}→${v}`)
          .join(', ')})`
      : '';
    summary.push(`${nodeId} → ${def?.shortName ?? defId}${ovStr}`);
  }

  // Ensure an MCU exists if user only listed peripherals
  const hasMcu = componentIds.some((id) => CATALOG_MAP[id]?.category === 'mcu');
  if (componentIds.length > 0 && !hasMcu) {
    componentIds.unshift('esp32-devkit');
    pinOverridesList.unshift(undefined);
    summary.unshift('Auto MCU → ESP32 DevKit');
  }

  const neededW = Math.max(boardWidthMm, componentIds.length > 6 ? 110 : 95);
  const neededH = Math.max(boardHeightMm, componentIds.length > 6 ? 80 : 72);

  const placed = autoPlaceComponents(
    componentIds,
    neededW,
    neededH,
    pinOverridesList
  );

  return {
    boardWidthMm: neededW,
    boardHeightMm: neededH,
    placed,
    summary,
  };
}

export interface JsonPcbComponent {
  id?: string;
  designator?: string;
  type: string;
  xMm?: number;
  yMm?: number;
  rotation?: 0 | 90 | 180 | 270;
  pins?: Record<string, string>;
}

export interface JsonPcbSchema {
  projectName?: string;
  board?: {
    widthMm?: number;
    heightMm?: number;
    copperMode?: '1-layer' | '2-layer';
  };
  components: JsonPcbComponent[];
  connections?: Array<{
    from: string;
    to: string;
  }>;
}

export function parseJsonToPcb(
  jsonText: string,
  fallbackW: number,
  fallbackH: number
): DiagramImportResult {
  const parsed = JSON.parse(jsonText) as Partial<JsonPcbSchema>;
  if (!parsed || !Array.isArray(parsed.components)) {
    throw new Error('Format JSON harus memiliki array "components".');
  }

  const boardW = Math.max(40, Math.min(250, Number(parsed.board?.widthMm) || fallbackW));
  const boardH = Math.max(40, Math.min(250, Number(parsed.board?.heightMm) || fallbackH));

  // Build pin overrides from connections array if present (e.g. from: "U1.GPIO26", to: "K1.IN")
  const connOverrides = new Map<string, Record<string, string>>();
  const compByAlias = new Map<string, JsonPcbComponent>();
  parsed.components.forEach((c, idx) => {
    const alias = c.id || c.designator || `C${idx + 1}`;
    compByAlias.set(alias, c);
  });

  if (Array.isArray(parsed.connections)) {
    for (const conn of parsed.connections) {
      if (!conn.from || !conn.to) continue;
      const [fromCompKey, fromPin] = conn.from.split('.');
      const [toCompKey, toPin] = conn.to.split('.');
      if (!fromCompKey || !fromPin || !toCompKey || !toPin) continue;

      const fromComp = compByAlias.get(fromCompKey);
      const toComp = compByAlias.get(toCompKey);
      const fromDefId = fromComp ? matchCatalogId(fromComp.type) : null;
      const toDefId = toComp ? matchCatalogId(toComp.type) : null;
      const fromIsMcu = fromDefId ? CATALOG_MAP[fromDefId]?.category === 'mcu' : false;
      const toIsMcu = toDefId ? CATALOG_MAP[toDefId]?.category === 'mcu' : false;

      if (fromIsMcu && toComp) {
        const targetKey = toCompKey;
        const prev = connOverrides.get(targetKey) ?? {};
        prev[toPin.toUpperCase()] = fromPin.toUpperCase();
        connOverrides.set(targetKey, prev);
      } else if (toIsMcu && fromComp) {
        const targetKey = fromCompKey;
        const prev = connOverrides.get(targetKey) ?? {};
        prev[fromPin.toUpperCase()] = toPin.toUpperCase();
        connOverrides.set(targetKey, prev);
      }
    }
  }

  const componentIds: string[] = [];
  const pinOverridesList: Array<Record<string, string> | undefined> = [];
  const explicitCoords: Array<{ xMm?: number; yMm?: number; rotation?: 0 | 90 | 180 | 270; designator?: string }> = [];
  const summary: string[] = [];

  parsed.components.forEach((item, idx) => {
    const defId = matchCatalogId(item.type);
    if (!defId) return;
    const alias = item.id || item.designator || `C${idx + 1}`;
    const mergedOverrides = {
      ...(connOverrides.get(alias) ?? {}),
      ...(item.pins ?? {}),
    };
    componentIds.push(defId);
    pinOverridesList.push(
      Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined
    );
    explicitCoords.push({
      xMm: typeof item.xMm === 'number' ? item.xMm : undefined,
      yMm: typeof item.yMm === 'number' ? item.yMm : undefined,
      rotation: item.rotation,
      designator: item.designator || item.id,
    });
    summary.push(`${alias} → ${CATALOG_MAP[defId]?.shortName ?? defId}`);
  });

  if (componentIds.length === 0) {
    throw new Error(
      `Tidak ada komponen valid ditemukan. Contoh tipe: ${COMPONENT_CATALOG.slice(0, 6)
        .map((c) => c.id)
        .join(', ')}`
    );
  }

  const autoPlaced = autoPlaceComponents(
    componentIds,
    boardW,
    boardH,
    pinOverridesList
  );

  // Preserve explicit coordinates/rotations where provided
  const finalPlaced = autoPlaced.map((p, idx) => {
    const ex = explicitCoords[idx];
    return {
      ...p,
      designator: ex?.designator ? ex.designator : p.designator,
      xMm: ex?.xMm !== undefined ? ex.xMm : p.xMm,
      yMm: ex?.yMm !== undefined ? ex.yMm : p.yMm,
      rotation: ex?.rotation !== undefined ? ex.rotation : p.rotation,
    };
  });

  return {
    projectName: parsed.projectName,
    boardWidthMm: boardW,
    boardHeightMm: boardH,
    copperMode: parsed.board?.copperMode,
    placed: finalPlaced,
    summary,
  };
}

export function exportBoardToJson(
  placed: PlacedComponent[],
  connections: NetConnection[],
  config: BoardConfig
): string {
  const schema: JsonPcbSchema = {
    projectName: config.projectName,
    board: {
      widthMm: config.widthMm,
      heightMm: config.heightMm,
      copperMode: config.copperMode,
    },
    components: placed.map((p) => ({
      id: p.designator,
      type: p.defId,
      xMm: Number(p.xMm.toFixed(2)),
      yMm: Number(p.yMm.toFixed(2)),
      rotation: p.rotation,
      ...(p.pinOverrides && Object.keys(p.pinOverrides).length > 0
        ? { pins: p.pinOverrides }
        : {}),
    })),
    connections: connections
      .filter((c) => c.netType === 'signal' || c.netType === 'adc')
      .map((c) => ({
        from: `${c.fromDesignator}.${c.fromPinId}`,
        to: `${c.toDesignator}.${c.toPinId}`,
      })),
  };

  return JSON.stringify(schema, null, 2);
}

export const SAMPLE_MERMAID_IMPORT = `flowchart LR
  J1["Terminal 5V"] -->|"5V"| U1{{"ESP32 DevKit"}}
  S1["Sensor DHT22"] -->|"DATA -> GPIO4"| U1
  SW1["Tombol Tactile"] -->|"SIG -> GPIO13"| U1
  U1 -->|"GPIO26 -> IN"| K1["Relay 1-CH"]
  U1 -->|"GPIO2 -> ANODA"| LED1["LED Indikator"]
  U1 -->|"I2C SDA/SCL"| DSP1["OLED 0.96"]`;

export const SAMPLE_JSON_IMPORT = `{
  "projectName": "ESP32_Otomasi_JSON",
  "board": {
    "widthMm": 100,
    "heightMm": 75,
    "copperMode": "1-layer"
  },
  "components": [
    { "id": "U1", "type": "esp32-devkit" },
    { "id": "S1", "type": "dht22", "pins": { "DATA": "GPIO4" } },
    { "id": "S2", "type": "hcsr04", "pins": { "TRIG": "GPIO18", "ECHO": "GPIO19" } },
    { "id": "K1", "type": "relay-1ch", "pins": { "IN": "GPIO26" } },
    { "id": "SW1", "type": "tactile-btn", "pins": { "SIG": "GPIO13" } },
    { "id": "J1", "type": "term-2p" }
  ]
}`;
