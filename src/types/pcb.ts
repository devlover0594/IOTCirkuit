export type ComponentCategory =
  | 'mcu'
  | 'actuator'
  | 'sensor'
  | 'tactile'
  | 'connector';

export type PinType =
  | 'power_5v'
  | 'power_3v3'
  | 'gnd'
  | 'gpio'
  | 'adc'
  | 'i2c_sda'
  | 'i2c_scl'
  | 'onewire'
  | 'pwm'
  | 'load';

export interface PinDef {
  id: string;
  label: string;
  /** Offset in mm from component top-left origin */
  dx: number;
  dy: number;
  /** Drill hole diameter in mm (0 for SMD, 0.8-1.2 for THT) */
  drillMm: number;
  /** Copper pad diameter in mm */
  padMm: number;
  type: PinType;
  /** Optional default MCU pin capability or Arduino/ESP GPIO number */
  gpioNum?: number;
  isInputOnly?: boolean;
  isAnalogCapable?: boolean;
  isPwmCapable?: boolean;
}

export interface ComponentDef {
  id: string;
  name: string;
  shortName: string;
  category: ComponentCategory;
  description: string;
  footprint: string;
  /** Physical bounding box in mm */
  widthMm: number;
  heightMm: number;
  voltage: '3.3V' | '5V' | '3.3V-5V' | '5V-12V';
  pins: PinDef[];
  /** Passive support parts automatically needed when assembling */
  supportParts?: {
    designatorPrefix: string;
    name: string;
    spec: string;
    footprint: string;
    note: string;
  }[];
}

export interface PlacedComponent {
  uid: string;
  defId: string;
  designator: string; // e.g., U1, K1, S1, SW1, J1
  label: string;
  /** Position in mm on the PCB */
  xMm: number;
  yMm: number;
  rotation: 0 | 90 | 180 | 270;
  /** Custom pin assignment overrides: component pin id -> MCU GPIO number or net name */
  pinOverrides?: Record<string, string>;
}

export interface NetConnection {
  id: string;
  netName: string;
  netType: 'power_5v' | 'power_3v3' | 'gnd' | 'signal' | 'i2c' | 'adc';
  fromUid: string;
  fromPinId: string;
  fromDesignator: string;
  fromPinLabel: string;
  toUid: string;
  toPinId: string;
  toDesignator: string;
  toPinLabel: string;
}

export interface PointMm {
  x: number;
  y: number;
}

export interface TraceSegment {
  id: string;
  netName: string;
  netType: NetConnection['netType'];
  layer: 'F.Cu' | 'B.Cu';
  widthMm: number;
  points: PointMm[];
}

export interface ViaPoint {
  id: string;
  xMm: number;
  yMm: number;
  drillMm: number;
  padMm: number;
  netName: string;
}

export interface BomItem {
  designators: string[];
  name: string;
  spec: string;
  footprint: string;
  qty: number;
  category: string;
  note: string;
}

export type ViewMode = 'pcb' | 'toner' | 'wiring' | 'mermaid' | 'sketch' | 'bom';
export type CopperMode = '1-layer' | '2-layer';
export type SolderMaskColor = 'green' | 'black' | 'blue' | 'red';

export interface BoardConfig {
  projectName: string;
  widthMm: number;
  heightMm: number;
  copperMode: CopperMode;
  traceWidthMm: number;
  solderMask: SolderMaskColor;
  mirrorToner: boolean;
  showDrillGuides: boolean;
  showSilkscreen: boolean;
  mountingHoles: boolean;
}

export interface RoutedBoard {
  placed: PlacedComponent[];
  connections: NetConnection[];
  traces: TraceSegment[];
  vias: ViaPoint[];
  bom: BomItem[];
  warnings: string[];
}
