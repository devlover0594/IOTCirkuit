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

export function generateTonerTransferSvgString(
  routed: RoutedBoard,
  config: BoardConfig
): string {
  const margin = 4; // 4mm margin around board outline for crop marks
  const totalW = config.widthMm + margin * 2;
  const totalH = config.heightMm + margin * 2;

  const transformX = (x: number) => (config.mirrorToner ? config.widthMm - x + margin : x + margin);
  const transformY = (y: number) => y + margin;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">`
  );
  parts.push(`<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff" />`);
  // Board outline cut guide
  parts.push(
    `<rect x="${margin}" y="${margin}" width="${config.widthMm}" height="${config.heightMm}" fill="none" stroke="#000000" stroke-width="0.25" />`
  );

  // Traces (Bottom Copper for DIY etching, or all copper if single-sided)
  for (const tr of routed.traces) {
    if (tr.points.length < 2) continue;
    const d = tr.points
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${transformX(pt.x).toFixed(3)} ${transformY(pt.y).toFixed(3)}`)
      .join(' ');
    parts.push(
      `<path d="${d}" fill="none" stroke="#000000" stroke-width="${tr.widthMm}" stroke-linecap="round" stroke-linejoin="round" />`
    );
  }

  // Component Pads (Black copper ring + white drill center for manual drilling)
  for (const comp of routed.placed) {
    const def = CATALOG_MAP[comp.defId];
    if (!def) continue;
    for (const pin of def.pins) {
      const pos = getPinWorldPos(comp, pin);
      const cx = transformX(pos.x);
      const cy = transformY(pos.y);
      parts.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(pin.padMm / 2).toFixed(3)}" fill="#000000" />`);
      if (config.showDrillGuides && pin.drillMm > 0) {
        parts.push(
          `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${Math.min(0.32, pin.drillMm * 0.35).toFixed(3)}" fill="#ffffff" />`
        );
      }
    }
  }

  // Vias
  for (const via of routed.vias) {
    const cx = transformX(via.xMm);
    const cy = transformY(via.yMm);
    parts.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(via.padMm / 2).toFixed(3)}" fill="#000000" />`);
    if (config.showDrillGuides) {
      parts.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="0.22" fill="#ffffff" />`);
    }
  }

  // Mounting Holes
  if (config.mountingHoles) {
    for (const mh of getMountingHolePositions(config)) {
      const cx = transformX(mh.x);
      const cy = transformY(mh.y);
      parts.push(`<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="1.6" fill="none" stroke="#000000" stroke-width="0.2" />`);
      parts.push(`<line x1="${cx - 2}" y1="${cy}" x2="${cx + 2}" y2="${cy}" stroke="#000000" stroke-width="0.15" />`);
      parts.push(`<line x1="${cx}" y1="${cy - 2}" x2="${cx}" y2="${cy + 2}" stroke="#000000" stroke-width="0.15" />`);
    }
  }

  parts.push(
    `<text x="${margin + 2}" y="${totalH - 1.2}" font-family="monospace" font-size="2.2" fill="#000000">${config.projectName} | ${config.widthMm}x${config.heightMm}mm | ${config.mirrorToner ? 'MIRRORED' : 'TOP VIEW'} 1:1</text>`
  );
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
