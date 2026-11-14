import { CATALOG_MAP } from '../data/catalog';
import { NetConnection, PlacedComponent } from '../types/pcb';

function sanitizeId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_]/g, '_');
}

function escapeLabel(raw: string): string {
  return raw.replace(/"/g, "'");
}

export function generateMermaidScript(
  placed: PlacedComponent[],
  connections: NetConnection[]
): string {
  if (placed.length === 0) {
    return `flowchart LR\n  EMPTY["Tambahkan komponen untuk membuat diagram alur koneksi"]`;
  }

  const lines: string[] = ['flowchart LR'];

  // Define node style classes
  lines.push('  classDef mcu fill:#0f172a,stroke:#06b6d4,stroke-width:2px,color:#f8fafc');
  lines.push('  classDef power fill:#1c1917,stroke:#f59e0b,stroke-width:1.5px,color:#fef3c7');
  lines.push('  classDef sensor fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#ecfdf5');
  lines.push('  classDef actuator fill:#4c0519,stroke:#f43f5e,stroke-width:1.5px,color:#ffe4e6');
  lines.push('  classDef input fill:#1e1b4b,stroke:#818cf8,stroke-width:1.5px,color:#e0e7ff');
  lines.push('');

  const mcus = placed.filter((p) => CATALOG_MAP[p.defId]?.category === 'mcu');
  const connectors = placed.filter((p) => CATALOG_MAP[p.defId]?.category === 'connector');
  const sensors = placed.filter((p) => CATALOG_MAP[p.defId]?.category === 'sensor');
  const tactiles = placed.filter((p) => CATALOG_MAP[p.defId]?.category === 'tactile');
  const actuators = placed.filter((p) => CATALOG_MAP[p.defId]?.category === 'actuator');

  // Power & Connector Subgraph
  if (connectors.length > 0) {
    lines.push('  subgraph PWR["Catu Daya & Konektor"]');
    for (const c of connectors) {
      const def = CATALOG_MAP[c.defId];
      const id = sanitizeId(c.designator);
      lines.push(`    ${id}["${escapeLabel(`${c.designator}: ${def?.shortName ?? c.label}`)}"]:::power`);
    }
    lines.push('  end');
    lines.push('');
  }

  // Sensors & Tactile Input Subgraph
  if (sensors.length > 0 || tactiles.length > 0) {
    lines.push('  subgraph SENS["Sensor & Tombol Input"]');
    for (const s of sensors) {
      const def = CATALOG_MAP[s.defId];
      const id = sanitizeId(s.designator);
      lines.push(`    ${id}["${escapeLabel(`${s.designator}: ${def?.shortName ?? s.label}`)}"]:::sensor`);
    }
    for (const t of tactiles) {
      const def = CATALOG_MAP[t.defId];
      const id = sanitizeId(t.designator);
      lines.push(`    ${id}["${escapeLabel(`${t.designator}: ${def?.shortName ?? t.label}`)}"]:::input`);
    }
    lines.push('  end');
    lines.push('');
  }

  // MCU Subgraph
  if (mcus.length > 0) {
    lines.push('  subgraph CTRL["Unit Mikrokontroler"]');
    for (const m of mcus) {
      const def = CATALOG_MAP[m.defId];
      const id = sanitizeId(m.designator);
      lines.push(`    ${id}{{"${escapeLabel(`${m.designator}: ${def?.shortName ?? m.label}`)} (${def?.voltage})"}}:::mcu`);
    }
    lines.push('  end');
    lines.push('');
  }

  // Actuators Subgraph
  if (actuators.length > 0) {
    lines.push('  subgraph ACT["Aktuator & Beban"]');
    for (const a of actuators) {
      const def = CATALOG_MAP[a.defId];
      const id = sanitizeId(a.designator);
      lines.push(`    ${id}["${escapeLabel(`${a.designator}: ${def?.shortName ?? a.label}`)}"]:::actuator`);
    }
    lines.push('  end');
    lines.push('');
  }

  // Group connections by component pair to keep flowchart readable & clean
  const mcuUid = mcus[0]?.uid;
  const pairEdgeLabels = new Map<string, { from: string; to: string; labels: Set<string>; isInput: boolean }>();

  for (const conn of connections) {
    // Signal & I2C connections
    const fromComp = placed.find((p) => p.uid === conn.fromUid);
    const toComp = placed.find((p) => p.uid === conn.toUid);
    if (!fromComp || !toComp) continue;

    // Skip redundant GND chains in flowchart to keep diagram uncluttered; keep power + signal + i2c
    if (conn.netType === 'gnd') continue;

    let src = fromComp;
    let dst = toComp;
    let edgeText = '';

    if (conn.netType === 'power_5v' || conn.netType === 'power_3v3') {
      edgeText = conn.netType === 'power_5v' ? '5V DC' : '3.3V';
      // Direct power arrow from connector -> MCU or MCU -> peripheral
      const fromCat = CATALOG_MAP[fromComp.defId]?.category;
      const toCat = CATALOG_MAP[toComp.defId]?.category;
      if (toCat === 'connector' && fromCat !== 'connector') {
        src = toComp;
        dst = fromComp;
      }
    } else if (conn.netType === 'i2c') {
      edgeText = conn.netName.replace('I2C_', '');
    } else {
      // Signal connection: determine flow direction (Sensor/Button -> MCU -> Actuator)
      const targetComp = toComp.uid === mcuUid ? fromComp : toComp;
      const targetCat = CATALOG_MAP[targetComp.defId]?.category;
      const mcuPinLbl = toComp.uid === mcuUid ? conn.toPinLabel : conn.fromPinLabel;
      const perPinLbl = toComp.uid === mcuUid ? conn.fromPinLabel : conn.toPinLabel;
      edgeText = `${mcuPinLbl} ↔ ${perPinLbl}`;

      if (targetCat === 'sensor' || (targetCat === 'tactile' && targetComp.defId !== 'led-5mm')) {
        src = targetComp;
        dst = mcus[0] ?? fromComp;
        edgeText = `${perPinLbl} → ${mcuPinLbl}`;
      } else {
        src = mcus[0] ?? fromComp;
        dst = targetComp;
        edgeText = `${mcuPinLbl} → ${perPinLbl}`;
      }
    }

    const key = `${src.designator}-->${dst.designator}`;
    const existing = pairEdgeLabels.get(key);
    if (existing) {
      existing.labels.add(edgeText);
    } else {
      pairEdgeLabels.set(key, {
        from: sanitizeId(src.designator),
        to: sanitizeId(dst.designator),
        labels: new Set([edgeText]),
        isInput: false,
      });
    }
  }

  for (const edge of pairEdgeLabels.values()) {
    const labelStr = escapeLabel(Array.from(edge.labels).join(' · '));
    lines.push(`  ${edge.from} -->|"${labelStr}"| ${edge.to}`);
  }

  return lines.join('\n');
}
