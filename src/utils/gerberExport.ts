import JSZip from 'jszip';
import { CATALOG_MAP } from '../data/catalog';
import { BoardConfig, BomItem, PlacedComponent, RoutedBoard } from '../types/pcb';
import { getPinWorldPos, getRotatedDims } from './autoRouter';

function fmtGerberCoord(mm: number): string {
  // 4.6 metric format: 1 mm = 1,000,000 units
  const val = Math.round(mm * 1_000_000);
  return String(val);
}

function fmtDrillCoord(mm: number): string {
  return mm.toFixed(3);
}

function getMountingHolePositions(config: BoardConfig) {
  const inset = 3.5;
  return [
    { x: inset, y: inset },
    { x: config.widthMm - inset, y: inset },
    { x: inset, y: config.heightMm - inset },
    { x: config.widthMm - inset, y: config.heightMm - inset },
  ];
}

function buildCopperLayerGerber(
  layerName: 'F.Cu' | 'B.Cu',
  routed: RoutedBoard,
  config: BoardConfig
): string {
  const lines: string[] = [
    `G04 TraceForge PCB Gerber RS-274X (${layerName})*`,
    `G04 Project: ${config.projectName}*`,
    '%FSLAX46Y46*%',
    '%MOMM*%',
    '%LPD*%',
  ];

  // Collect unique circular aperture sizes (pads + trace widths)
  const apertureMap = new Map<string, number>();
  let nextCode = 10;
  const getAperture = (diamMm: number): number => {
    const key = diamMm.toFixed(3);
    const existing = apertureMap.get(key);
    if (existing) return existing;
    const code = nextCode++;
    apertureMap.set(key, code);
    return code;
  };

  // Pre-register pad diameters, via diameters, and trace widths
  const pads: Array<{ x: number; y: number; diam: number }> = [];
  for (const comp of routed.placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;
    for (const pin of def.pins) {
      const pos = getPinWorldPos(comp, pin);
      // Invert Y for Gerber standard bottom-left origin
      const gy = config.heightMm - pos.y;
      pads.push({ x: pos.x, y: gy, diam: pin.padMm });
      getAperture(pin.padMm);
    }
  }

  for (const via of routed.vias) {
    const gy = config.heightMm - via.yMm;
    pads.push({ x: via.xMm, y: gy, diam: via.padMm });
    getAperture(via.padMm);
  }

  const layerTraces = routed.traces.filter((t) => t.layer === layerName);
  for (const tr of layerTraces) {
    getAperture(tr.widthMm);
  }

  // Emit aperture definitions
  for (const [diamStr, code] of apertureMap.entries()) {
    lines.push(`%ADD${code}C,${diamStr}*%`);
  }

  // Flash pads (THT pads appear on both F.Cu and B.Cu)
  for (const pad of pads) {
    const code = getAperture(pad.diam);
    lines.push(`D${code}*`);
    lines.push(`X${fmtGerberCoord(pad.x)}Y${fmtGerberCoord(pad.y)}D03*`);
  }

  // Draw copper traces
  for (const tr of layerTraces) {
    if (tr.points.length < 2) continue;
    const code = getAperture(tr.widthMm);
    lines.push(`D${code}*`);
    tr.points.forEach((pt, idx) => {
      const gy = config.heightMm - pt.y;
      const op = idx === 0 ? 'D02' : 'D01';
      lines.push(`X${fmtGerberCoord(pt.x)}Y${fmtGerberCoord(gy)}${op}*`);
    });
  }

  lines.push('M02*');
  return lines.join('\n');
}

function buildMaskLayerGerber(
  layerName: 'F.Mask' | 'B.Mask',
  routed: RoutedBoard,
  config: BoardConfig
): string {
  const lines: string[] = [
    `G04 TraceForge PCB Solder Mask (${layerName})*`,
    '%FSLAX46Y46*%',
    '%MOMM*%',
    '%LPD*%',
  ];

  const apertureMap = new Map<string, number>();
  let nextCode = 10;
  const getAperture = (diamMm: number): number => {
    const key = diamMm.toFixed(3);
    const existing = apertureMap.get(key);
    if (existing) return existing;
    const code = nextCode++;
    apertureMap.set(key, code);
    return code;
  };

  const openings: Array<{ x: number; y: number; diam: number }> = [];
  for (const comp of routed.placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;
    for (const pin of def.pins) {
      const pos = getPinWorldPos(comp, pin);
      const maskDiam = pin.padMm + 0.15;
      openings.push({ x: pos.x, y: config.heightMm - pos.y, diam: maskDiam });
      getAperture(maskDiam);
    }
  }

  for (const [diamStr, code] of apertureMap.entries()) {
    lines.push(`%ADD${code}C,${diamStr}*%`);
  }

  for (const op of openings) {
    const code = getAperture(op.diam);
    lines.push(`D${code}*`);
    lines.push(`X${fmtGerberCoord(op.x)}Y${fmtGerberCoord(op.y)}D03*`);
  }

  lines.push('M02*');
  return lines.join('\n');
}

function buildSilkscreenGerber(routed: RoutedBoard, config: BoardConfig): string {
  const lines: string[] = [
    'G04 TraceForge PCB Top Silkscreen (F.SilkS)*',
    '%FSLAX46Y46*%',
    '%MOMM*%',
    '%LPD*%',
    '%ADD10C,0.150*%',
    'D10*',
  ];

  for (const comp of routed.placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;
    const dims = getRotatedDims(def, comp.rotation);
    const x1 = comp.xMm;
    const x2 = comp.xMm + dims.widthMm;
    const y1 = config.heightMm - comp.yMm;
    const y2 = config.heightMm - (comp.yMm + dims.heightMm);

    lines.push(`X${fmtGerberCoord(x1)}Y${fmtGerberCoord(y1)}D02*`);
    lines.push(`X${fmtGerberCoord(x2)}Y${fmtGerberCoord(y1)}D01*`);
    lines.push(`X${fmtGerberCoord(x2)}Y${fmtGerberCoord(y2)}D01*`);
    lines.push(`X${fmtGerberCoord(x1)}Y${fmtGerberCoord(y2)}D01*`);
    lines.push(`X${fmtGerberCoord(x1)}Y${fmtGerberCoord(y1)}D01*`);
  }

  lines.push('M02*');
  return lines.join('\n');
}

function buildEdgeCutsGerber(config: BoardConfig): string {
  const w = config.widthMm;
  const h = config.heightMm;
  return [
    'G04 TraceForge PCB Board Outline (Edge.Cuts)*',
    '%FSLAX46Y46*%',
    '%MOMM*%',
    '%LPD*%',
    '%ADD10C,0.100*%',
    'D10*',
    `X0Y0D02*`,
    `X${fmtGerberCoord(w)}Y0D01*`,
    `X${fmtGerberCoord(w)}Y${fmtGerberCoord(h)}D01*`,
    `X0Y${fmtGerberCoord(h)}D01*`,
    `X0Y0D01*`,
    'M02*',
  ].join('\n');
}

function buildExcellonDrill(routed: RoutedBoard, config: BoardConfig): string {
  const toolGroups = new Map<string, Array<{ x: number; y: number }>>();

  const addHole = (diamMm: number, x: number, y: number) => {
    const key = diamMm.toFixed(3);
    const list = toolGroups.get(key) ?? [];
    list.push({ x, y: config.heightMm - y });
    toolGroups.set(key, list);
  };

  for (const comp of routed.placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;
    for (const pin of def.pins) {
      if (pin.drillMm <= 0) continue;
      const pos = getPinWorldPos(comp, pin);
      addHole(pin.drillMm, pos.x, pos.y);
    }
  }

  for (const via of routed.vias) {
    addHole(via.drillMm, via.xMm, via.yMm);
  }

  if (config.mountingHoles) {
    for (const mh of getMountingHolePositions(config)) {
      addHole(3.2, mh.x, mh.y);
    }
  }

  const lines: string[] = [
    'M48',
    '; TraceForge PCB Excellon Drill File',
    'FMAT,2',
    'METRIC,TZ',
  ];

  const entries = Array.from(toolGroups.entries());
  entries.forEach(([diam], idx) => {
    lines.push(`T${idx + 1}C${diam}`);
  });
  lines.push('%');
  lines.push('G90');
  lines.push('G05');

  entries.forEach(([, holes], idx) => {
    lines.push(`T${idx + 1}`);
    for (const h of holes) {
      lines.push(`X${fmtDrillCoord(h.x)}Y${fmtDrillCoord(h.y)}`);
    }
  });

  lines.push('T0');
  lines.push('M30');
  return lines.join('\n');
}

export async function exportGerberZip(routed: RoutedBoard, config: BoardConfig): Promise<void> {
  const zip = new JSZip();
  const safeName = config.projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'traceforge_pcb';

  zip.file(`${safeName}-B_Cu.gbl`, buildCopperLayerGerber('B.Cu', routed, config));
  if (config.copperMode === '2-layer') {
    zip.file(`${safeName}-F_Cu.gtl`, buildCopperLayerGerber('F.Cu', routed, config));
  }
  zip.file(`${safeName}-B_Mask.gbs`, buildMaskLayerGerber('B.Mask', routed, config));
  zip.file(`${safeName}-F_Mask.gts`, buildMaskLayerGerber('F.Mask', routed, config));
  zip.file(`${safeName}-F_SilkS.gto`, buildSilkscreenGerber(routed, config));
  zip.file(`${safeName}-Edge_Cuts.gm1`, buildEdgeCutsGerber(config));
  zip.file(`${safeName}-PTH.drl`, buildExcellonDrill(routed, config));

  zip.file(
    'README_FAB.txt',
    [
      `Project: ${config.projectName}`,
      `Dimensions: ${config.widthMm}mm x ${config.heightMm}mm`,
      `Layers: ${config.copperMode === '1-layer' ? '1-Layer (Bottom Copper)' : '2-Layer (Top + Bottom Copper)'}`,
      `Thickness: 1.6mm FR4`,
      `Format: Gerber RS-274X (4.6 Metric) + Excellon Drill`,
      `Components Placed: ${routed.placed.length}`,
      `Routed Traces: ${routed.traces.length}`,
    ].join('\n')
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${safeName}_gerber.zip`);
}

function buildSingleLayerTonerGroup(
  layer: 'F.Cu' | 'B.Cu',
  routed: RoutedBoard,
  config: BoardConfig,
  offsetX: number,
  offsetY: number
): string[] {
  const parts: string[] = [];
  // For toner transfer:
  // If mirrorToner is enabled, Bottom (B.Cu) or Top (F.Cu) mirrors horizontally according to user toggle.
  // Specifically, in dual-layer toner transfer, ironing onto Top Copper requires F.Cu mirrored relative to top view,
  // whereas ironing onto Bottom Copper (after flipping board) requires B.Cu un-mirrored relative to top view (or mirrored if printing directly from bottom view).
  // Here we apply config.mirrorToner cleanly so user has deterministic control, and label each sheet explicitly.
  const shouldMirror =
    config.copperMode === '2-layer' && config.printLayerMode === 'both'
      ? layer === 'F.Cu'
        ? config.mirrorToner
        : !config.mirrorToner
      : config.mirrorToner;

  const tx = (x: number) => offsetX + (shouldMirror ? config.widthMm - x : x);
  const ty = (y: number) => offsetY + y;

  // Board outline cut guide
  parts.push(
    `<rect x="${offsetX}" y="${offsetY}" width="${config.widthMm}" height="${config.heightMm}" fill="none" stroke="#000000" stroke-width="0.28" />`
  );

  // Corner crop marks
  const corners: Array<[number, number, number, number]> = [
    [offsetX, offsetY, -1, -1],
    [offsetX + config.widthMm, offsetY, 1, -1],
    [offsetX, offsetY + config.heightMm, -1, 1],
    [offsetX + config.widthMm, offsetY + config.heightMm, 1, 1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${cx + sx * 3}" y2="${cy}" stroke="#000000" stroke-width="0.2" />`);
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + sy * 3}" stroke="#000000" stroke-width="0.2" />`);
  }

  // ONLY traces belonging to this copper layer!
  const layerTraces = routed.traces.filter((t) => t.layer === layer);
  for (const tr of layerTraces) {
    if (tr.points.length < 2) continue;
    const d = tr.points
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${tx(pt.x).toFixed(3)} ${ty(pt.y).toFixed(3)}`)
      .join(' ');
    parts.push(
      `<path d="${d}" fill="none" stroke="#000000" stroke-width="${tr.widthMm}" stroke-linecap="round" stroke-linejoin="round" />`
    );
  }

  // THT Component Pads (present on both Top and Bottom copper)
  for (const comp of routed.placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;
    for (const pin of def.pins) {
      const pos = getPinWorldPos(comp, pin);
      const cx = tx(pos.x);
      const cy = ty(pos.y);
      parts.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(pin.padMm / 2).toFixed(3)}" fill="#000000" />`);
      if (config.showDrillGuides && pin.drillMm > 0) {
        parts.push(
          `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${Math.min(0.32, pin.drillMm * 0.35).toFixed(3)}" fill="#ffffff" />`
        );
      }
    }
  }

  // Vias (present on both layers in 2-layer mode)
  for (const via of routed.vias) {
    const cx = tx(via.xMm);
    const cy = ty(via.yMm);
    parts.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(via.padMm / 2).toFixed(3)}" fill="#000000" />`);
    if (config.showDrillGuides) {
      parts.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="0.22" fill="#ffffff" />`);
    }
  }

  // Mounting Holes
  if (config.mountingHoles) {
    for (const mh of getMountingHolePositions(config)) {
      const cx = tx(mh.x);
      const cy = ty(mh.y);
      parts.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="1.6" fill="none" stroke="#000000" stroke-width="0.2" />`);
      parts.push(`<line x1="${cx - 2}" y1="${cy}" x2="${cx + 2}" y2="${cy}" stroke="#000000" stroke-width="0.15" />`);
      parts.push(`<line x1="${cx}" y1="${cy - 2}" x2="${cx}" y2="${cy + 2}" stroke="#000000" stroke-width="0.15" />`);
    }
  }

  // Layer Header & Footer Stamp
  const layerLabel = layer === 'F.Cu' ? 'LAYER TOP (F.Cu)' : 'LAYER BOTTOM (B.Cu)';
  parts.push(
    `<text x="${offsetX}" y="${offsetY - 1.5}" font-family="monospace" font-size="2.4" font-weight="bold" fill="#000000">${layerLabel} — ${layerTraces.length} Jalur (${shouldMirror ? 'MIRRORED' : 'NORMAL'})</text>`
  );
  parts.push(
    `<text x="${offsetX}" y="${offsetY + config.heightMm + 3.8}" font-family="monospace" font-size="2.0" fill="#000000">${config.projectName} | ${config.widthMm}×${config.heightMm}mm | SKALA 1:1</text>`
  );

  // 10mm physical calibration bar
  const calX1 = offsetX + config.widthMm - 12;
  const calX2 = offsetX + config.widthMm - 2;
  const calY = offsetY + config.heightMm + 3.0;
  parts.push(`<line x1="${calX1}" y1="${calY}" x2="${calX2}" y2="${calY}" stroke="#000000" stroke-width="0.35" />`);
  parts.push(`<line x1="${calX1}" y1="${calY - 1}" x2="${calX1}" y2="${calY + 1}" stroke="#000000" stroke-width="0.25" />`);
  parts.push(`<line x1="${calX2}" y1="${calY - 1}" x2="${calX2}" y2="${calY + 1}" stroke="#000000" stroke-width="0.25" />`);
  parts.push(`<text x="${(calX1 + calX2) / 2}" y="${calY + 2.5}" text-anchor="middle" font-family="monospace" font-size="1.7" fill="#000000">10 mm</text>`);

  return parts;
}

export function generateTonerTransferSvgString(
  routed: RoutedBoard,
  config: BoardConfig
): string {
  const marginX = 6;
  const marginTop = 8;
  const marginBottom = 9;
  const gapBetween = 12;

  const isDualBoth = config.copperMode === '2-layer' && config.printLayerMode === 'both';
  const stackVertically = isDualBoth && config.widthMm > 95;

  const totalW =
    isDualBoth && !stackVertically
      ? config.widthMm * 2 + gapBetween + marginX * 2
      : config.widthMm + marginX * 2;
  const totalH =
    isDualBoth && stackVertically
      ? config.heightMm * 2 + gapBetween + marginTop + marginBottom
      : config.heightMm + marginTop + marginBottom;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">`
  );
  parts.push(`<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff" />`);

  if (config.copperMode === '1-layer' || config.printLayerMode === 'bottom') {
    parts.push(...buildSingleLayerTonerGroup('B.Cu', routed, config, marginX, marginTop));
  } else if (config.printLayerMode === 'top') {
    parts.push(...buildSingleLayerTonerGroup('F.Cu', routed, config, marginX, marginTop));
  } else {
    // Both layers printed together (Top F.Cu + Bottom B.Cu)
    parts.push(...buildSingleLayerTonerGroup('F.Cu', routed, config, marginX, marginTop));
    const secondX = stackVertically ? marginX : marginX + config.widthMm + gapBetween;
    const secondY = stackVertically ? marginTop + config.heightMm + gapBetween : marginTop;
    parts.push(...buildSingleLayerTonerGroup('B.Cu', routed, config, secondX, secondY));
  }

  parts.push('</svg>');
  return parts.join('\n');
}

export function downloadSvgElement(svgEl: SVGSVGElement | null, filename: string) {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgEl);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

export function downloadSvgString(svgStr: string, filename: string) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

export function downloadPngFromSvgString(svgStr: string, filename: string, scalePxPerMm = 12) {
  const img = new Image();
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(800, Math.round(img.width * (scalePxPerMm / 3.7795)));
    canvas.height = Math.max(600, Math.round(img.height * (scalePxPerMm / 3.7795)));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) triggerDownload(pngBlob, filename);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } else {
      URL.revokeObjectURL(url);
    }
  };
  img.src = url;
}

export function exportBomCsv(bom: BomItem[], projectName: string) {
  const header = ['Designator', 'Nama Komponen', 'Spesifikasi', 'Footprint', 'Jumlah', 'Kategori', 'Catatan'];
  const rows = bom.map((b) => [
    `"${b.designators.join(', ')}"`,
    `"${b.name.replace(/"/g, '""')}"`,
    `"${b.spec}"`,
    `"${b.footprint}"`,
    String(b.qty),
    `"${b.category}"`,
    `"${b.note.replace(/"/g, '""')}"`,
  ]);
  const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'bom';
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeName}_bom.csv`);
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
