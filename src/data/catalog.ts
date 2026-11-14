import { ComponentDef } from '../types/pcb';

const P = 2.54; // Standard 0.1" THT pitch in mm

export const COMPONENT_CATALOG: ComponentDef[] = [
  // ================= MIKROKONTROLER (MCU) =================
  {
    id: 'esp32-devkit',
    name: 'ESP32 DevKit V1 (30-Pin)',
    shortName: 'ESP32 DevKit',
    category: 'mcu',
    description: 'WiFi + BLE Dual-Core MCU, 3.3V logic, header 2×15 pin pitch 2.54mm',
    footprint: 'ESP32-DEVKIT-30P',
    widthMm: 28,
    heightMm: 52,
    voltage: '3.3V-5V',
    pins: [
      // Left column (dx = 2.54)
      { id: '3V3', label: '3V3', dx: 2.54, dy: 6 + 0 * P, drillMm: 0.9, padMm: 1.7, type: 'power_3v3' },
      { id: 'GND1', label: 'GND', dx: 2.54, dy: 6 + 1 * P, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'D15', label: 'GPIO15', dx: 2.54, dy: 6 + 2 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 15, isPwmCapable: true },
      { id: 'D2', label: 'GPIO2', dx: 2.54, dy: 6 + 3 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 2, isPwmCapable: true },
      { id: 'D4', label: 'GPIO4', dx: 2.54, dy: 6 + 4 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 4, isPwmCapable: true },
      { id: 'RX2', label: 'GPIO16', dx: 2.54, dy: 6 + 5 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 16, isPwmCapable: true },
      { id: 'TX2', label: 'GPIO17', dx: 2.54, dy: 6 + 6 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 17, isPwmCapable: true },
      { id: 'D5', label: 'GPIO5', dx: 2.54, dy: 6 + 7 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 5, isPwmCapable: true },
      { id: 'D18', label: 'GPIO18', dx: 2.54, dy: 6 + 8 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 18, isPwmCapable: true },
      { id: 'D19', label: 'GPIO19', dx: 2.54, dy: 6 + 9 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 19, isPwmCapable: true },
      { id: 'D21', label: 'SDA (21)', dx: 2.54, dy: 6 + 10 * P, drillMm: 0.9, padMm: 1.7, type: 'i2c_sda', gpioNum: 21 },
      { id: 'RX0', label: 'GPIO3', dx: 2.54, dy: 6 + 11 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 3 },
      { id: 'TX0', label: 'GPIO1', dx: 2.54, dy: 6 + 12 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 1 },
      { id: 'D22', label: 'SCL (22)', dx: 2.54, dy: 6 + 13 * P, drillMm: 0.9, padMm: 1.7, type: 'i2c_scl', gpioNum: 22 },
      { id: 'D23', label: 'GPIO23', dx: 2.54, dy: 6 + 14 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 23, isPwmCapable: true },

      // Right column (dx = 25.46, 22.92mm spacing or 25.4mm)
      { id: 'VIN', label: 'VIN 5V', dx: 25.46, dy: 6 + 0 * P, drillMm: 0.9, padMm: 1.7, type: 'power_5v' },
      { id: 'GND2', label: 'GND', dx: 25.46, dy: 6 + 1 * P, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'D13', label: 'GPIO13', dx: 25.46, dy: 6 + 2 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 13, isPwmCapable: true },
      { id: 'D12', label: 'GPIO12', dx: 25.46, dy: 6 + 3 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 12, isPwmCapable: true },
      { id: 'D14', label: 'GPIO14', dx: 25.46, dy: 6 + 4 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 14, isPwmCapable: true },
      { id: 'D27', label: 'GPIO27', dx: 25.46, dy: 6 + 5 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 27, isPwmCapable: true },
      { id: 'D26', label: 'GPIO26', dx: 25.46, dy: 6 + 6 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 26, isPwmCapable: true },
      { id: 'D25', label: 'GPIO25', dx: 25.46, dy: 6 + 7 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 25, isPwmCapable: true },
      { id: 'D33', label: 'GPIO33', dx: 25.46, dy: 6 + 8 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 33, isAnalogCapable: true, isPwmCapable: true },
      { id: 'D32', label: 'GPIO32', dx: 25.46, dy: 6 + 9 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 32, isAnalogCapable: true, isPwmCapable: true },
      { id: 'D35', label: 'GPIO35', dx: 25.46, dy: 6 + 10 * P, drillMm: 0.9, padMm: 1.7, type: 'adc', gpioNum: 35, isInputOnly: true, isAnalogCapable: true },
      { id: 'D34', label: 'GPIO34', dx: 25.46, dy: 6 + 11 * P, drillMm: 0.9, padMm: 1.7, type: 'adc', gpioNum: 34, isInputOnly: true, isAnalogCapable: true },
      { id: 'VN', label: 'GPIO39', dx: 25.46, dy: 6 + 12 * P, drillMm: 0.9, padMm: 1.7, type: 'adc', gpioNum: 39, isInputOnly: true, isAnalogCapable: true },
      { id: 'VP', label: 'GPIO36', dx: 25.46, dy: 6 + 13 * P, drillMm: 0.9, padMm: 1.7, type: 'adc', gpioNum: 36, isInputOnly: true, isAnalogCapable: true },
      { id: 'EN', label: 'EN', dx: 25.46, dy: 6 + 14 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio' },
    ],
    supportParts: [
      {
        designatorPrefix: 'H',
        name: 'Female Pin Header 1×15 (2 pcs)',
        spec: 'Pitch 2.54mm',
        footprint: 'HDR-1x15-2.54',
        note: 'Socket agar ESP32 mudah dilepas-pasang',
      },
      {
        designatorPrefix: 'C',
        name: 'Kapasitor Keramik Decoupling',
        spec: '100nF 50V',
        footprint: 'RAD-5mm',
        note: 'Pasang dekat pin VIN/3V3 dan GND',
      },
    ],
  },
  {
    id: 'esp8266-nodemcu',
    name: 'NodeMCU ESP8266 v3',
    shortName: 'NodeMCU v3',
    category: 'mcu',
    description: 'WiFi MCU hemat biaya, 3.3V logic, header 2×15 pin',
    footprint: 'NODEMCU-V3-30P',
    widthMm: 31,
    heightMm: 54,
    voltage: '3.3V-5V',
    pins: [
      { id: '3V3', label: '3V3', dx: 2.54, dy: 7 + 0 * P, drillMm: 0.9, padMm: 1.7, type: 'power_3v3' },
      { id: 'GND1', label: 'GND', dx: 2.54, dy: 7 + 1 * P, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'D0', label: 'D0 (16)', dx: 2.54, dy: 7 + 2 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 16 },
      { id: 'D1', label: 'SCL D1(5)', dx: 2.54, dy: 7 + 3 * P, drillMm: 0.9, padMm: 1.7, type: 'i2c_scl', gpioNum: 5 },
      { id: 'D2', label: 'SDA D2(4)', dx: 2.54, dy: 7 + 4 * P, drillMm: 0.9, padMm: 1.7, type: 'i2c_sda', gpioNum: 4 },
      { id: 'D3', label: 'D3 (0)', dx: 2.54, dy: 7 + 5 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 0 },
      { id: 'D4', label: 'D4 (2)', dx: 2.54, dy: 7 + 6 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 2 },
      { id: 'D5', label: 'D5 (14)', dx: 2.54, dy: 7 + 7 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 14, isPwmCapable: true },
      { id: 'D6', label: 'D6 (12)', dx: 2.54, dy: 7 + 8 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 12, isPwmCapable: true },
      { id: 'D7', label: 'D7 (13)', dx: 2.54, dy: 7 + 9 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 13, isPwmCapable: true },
      { id: 'D8', label: 'D8 (15)', dx: 2.54, dy: 7 + 10 * P, drillMm: 0.9, padMm: 1.7, type: 'gpio', gpioNum: 15, isPwmCapable: true },
      { id: 'VIN', label: 'VIN 5V', dx: 28.46, dy: 7 + 0 * P, drillMm: 0.9, padMm: 1.7, type: 'power_5v' },
      { id: 'GND2', label: 'GND', dx: 28.46, dy: 7 + 1 * P, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'A0', label: 'A0 (ADC)', dx: 28.46, dy: 7 + 5 * P, drillMm: 0.9, padMm: 1.7, type: 'adc', gpioNum: 0, isAnalogCapable: true, isInputOnly: true },
    ],
  },
  {
    id: 'arduino-nano',
    name: 'Arduino Nano v3 (ATmega328P)',
    shortName: 'Arduino Nano',
    category: 'mcu',
    description: 'Board AVR klasik 5V logic, compact DIP-30, ideal untuk kontrol relay & sensor 5V',
    footprint: 'ARDUINO-NANO-DIP30',
    widthMm: 18,
    heightMm: 45,
    voltage: '5V',
    pins: [
      { id: 'D12', label: 'D12', dx: 1.5, dy: 5 + 0 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 12 },
      { id: 'D11', label: 'D11', dx: 1.5, dy: 5 + 1 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 11, isPwmCapable: true },
      { id: 'D10', label: 'D10', dx: 1.5, dy: 5 + 2 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 10, isPwmCapable: true },
      { id: 'D9', label: 'D9', dx: 1.5, dy: 5 + 3 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 9, isPwmCapable: true },
      { id: 'D8', label: 'D8', dx: 1.5, dy: 5 + 4 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 8 },
      { id: 'D7', label: 'D7', dx: 1.5, dy: 5 + 5 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 7 },
      { id: 'D6', label: 'D6', dx: 1.5, dy: 5 + 6 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 6, isPwmCapable: true },
      { id: 'D5', label: 'D5', dx: 1.5, dy: 5 + 7 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 5, isPwmCapable: true },
      { id: 'D4', label: 'D4', dx: 1.5, dy: 5 + 8 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 4 },
      { id: 'D3', label: 'D3', dx: 1.5, dy: 5 + 9 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 3, isPwmCapable: true },
      { id: 'D2', label: 'D2', dx: 1.5, dy: 5 + 10 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 2 },
      { id: 'GND1', label: 'GND', dx: 1.5, dy: 5 + 11 * P, drillMm: 0.9, padMm: 1.65, type: 'gnd' },
      { id: 'D13', label: 'D13', dx: 16.5, dy: 5 + 0 * P, drillMm: 0.9, padMm: 1.65, type: 'gpio', gpioNum: 13 },
      { id: '3V3', label: '3V3', dx: 16.5, dy: 5 + 1 * P, drillMm: 0.9, padMm: 1.65, type: 'power_3v3' },
      { id: 'A0', label: 'A0', dx: 16.5, dy: 5 + 3 * P, drillMm: 0.9, padMm: 1.65, type: 'adc', gpioNum: 14, isAnalogCapable: true },
      { id: 'A1', label: 'A1', dx: 16.5, dy: 5 + 4 * P, drillMm: 0.9, padMm: 1.65, type: 'adc', gpioNum: 15, isAnalogCapable: true },
      { id: 'A2', label: 'A2', dx: 16.5, dy: 5 + 5 * P, drillMm: 0.9, padMm: 1.65, type: 'adc', gpioNum: 16, isAnalogCapable: true },
      { id: 'A3', label: 'A3', dx: 16.5, dy: 5 + 6 * P, drillMm: 0.9, padMm: 1.65, type: 'adc', gpioNum: 17, isAnalogCapable: true },
      { id: 'A4', label: 'SDA (A4)', dx: 16.5, dy: 5 + 7 * P, drillMm: 0.9, padMm: 1.65, type: 'i2c_sda', gpioNum: 18 },
      { id: 'A5', label: 'SCL (A5)', dx: 16.5, dy: 5 + 8 * P, drillMm: 0.9, padMm: 1.65, type: 'i2c_scl', gpioNum: 19 },
      { id: '5V', label: '5V', dx: 16.5, dy: 5 + 10 * P, drillMm: 0.9, padMm: 1.65, type: 'power_5v' },
      { id: 'GND2', label: 'GND', dx: 16.5, dy: 5 + 12 * P, drillMm: 0.9, padMm: 1.65, type: 'gnd' },
    ],
  },

  // ================= AKTUATOR & RELAY =================
  {
    id: 'relay-1ch',
    name: 'Modul Relay 1-Channel (5V)',
    shortName: 'Relay 1-CH',
    category: 'actuator',
    description: 'Relay SPDT 10A/250VAC dengan optocoupler, aktif LOW/HIGH + terminal beban',
    footprint: 'RELAY-MOD-1CH',
    widthMm: 24,
    heightMm: 34,
    voltage: '5V',
    pins: [
      { id: 'VCC', label: 'VCC', dx: 4, dy: 4, drillMm: 0.9, padMm: 1.8, type: 'power_5v' },
      { id: 'GND', label: 'GND', dx: 4 + P, dy: 4, drillMm: 0.9, padMm: 1.8, type: 'gnd' },
      { id: 'IN', label: 'IN', dx: 4 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.8, type: 'gpio' },
    ],
    supportParts: [
      {
        designatorPrefix: 'D',
        name: 'Dioda Flyback Proteksi',
        spec: '1N4007 / 1N4148',
        footprint: 'DO-41',
        note: 'Opsional jika memakai relay bare SRD-05VDC langsung',
      },
    ],
  },
  {
    id: 'relay-2ch',
    name: 'Modul Relay 2-Channel (5V)',
    shortName: 'Relay 2-CH',
    category: 'actuator',
    description: 'Dual relay 10A/250VAC terisolasi optocoupler untuk kontrol 2 beban AC/DC',
    footprint: 'RELAY-MOD-2CH',
    widthMm: 38,
    heightMm: 34,
    voltage: '5V',
    pins: [
      { id: 'VCC', label: 'VCC', dx: 6, dy: 4, drillMm: 0.9, padMm: 1.8, type: 'power_5v' },
      { id: 'IN1', label: 'IN1', dx: 6 + P, dy: 4, drillMm: 0.9, padMm: 1.8, type: 'gpio' },
      { id: 'IN2', label: 'IN2', dx: 6 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.8, type: 'gpio' },
      { id: 'GND', label: 'GND', dx: 6 + 3 * P, dy: 4, drillMm: 0.9, padMm: 1.8, type: 'gnd' },
    ],
  },
  {
    id: 'buzzer-5v',
    name: 'Buzzer Aktif / Pasif 5V (12mm)',
    shortName: 'Buzzer 5V',
    category: 'actuator',
    description: 'Buzzer piezo diameter 12mm, pitch 7.62mm untuk alarm & notifikasi suara',
    footprint: 'BUZZER-12MM',
    widthMm: 14,
    heightMm: 14,
    voltage: '5V',
    pins: [
      { id: 'SIG', label: '+', dx: 3.19, dy: 7, drillMm: 0.9, padMm: 1.9, type: 'pwm' },
      { id: 'GND', label: '-', dx: 10.81, dy: 7, drillMm: 0.9, padMm: 1.9, type: 'gnd' },
    ],
  },
  {
    id: 'mosfet-irlz44n',
    name: 'Driver MOSFET IRLZ44N (TO-220)',
    shortName: 'MOSFET PWM',
    category: 'actuator',
    description: 'Logic-level N-MOSFET untuk pompa DC, LED strip, atau kipas PWM 12V',
    footprint: 'TO-220-3P',
    widthMm: 14,
    heightMm: 16,
    voltage: '3.3V-5V',
    pins: [
      { id: 'GATE', label: 'G (PWM)', dx: 4.46, dy: 5, drillMm: 1.0, padMm: 1.9, type: 'pwm' },
      { id: 'DRAIN', label: 'D (LOAD)', dx: 4.46 + P, dy: 5, drillMm: 1.0, padMm: 1.9, type: 'load' },
      { id: 'SOURCE', label: 'S (GND)', dx: 4.46 + 2 * P, dy: 5, drillMm: 1.0, padMm: 1.9, type: 'gnd' },
    ],
    supportParts: [
      {
        designatorPrefix: 'R',
        name: 'Resistor Pull-Down Gate MOSFET',
        spec: '10kΩ 1/4W',
        footprint: 'AXIAL-0.4',
        note: 'Mencegah MOSFET menyala tidak sengaja saat boot',
      },
      {
        designatorPrefix: 'R',
        name: 'Resistor Seri Gate',
        spec: '220Ω 1/4W',
        footprint: 'AXIAL-0.4',
        note: 'Membatasi arus inrush ke Gate dari pin GPIO',
      },
    ],
  },

  // ================= MODUL SENSOR =================
  {
    id: 'dht22',
    name: 'Sensor Suhu & Kelembaban DHT22/11',
    shortName: 'DHT22 / DHT11',
    category: 'sensor',
    description: 'Sensor digital suhu & RH 3-pin breakout module (VCC, DATA, GND)',
    footprint: 'HDR-1x3-2.54',
    widthMm: 14,
    heightMm: 18,
    voltage: '3.3V-5V',
    pins: [
      { id: 'VCC', label: 'VCC', dx: 4.46, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'power_3v3' },
      { id: 'DATA', label: 'DATA', dx: 4.46 + P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gpio' },
      { id: 'GND', label: 'GND', dx: 4.46 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
    ],
    supportParts: [
      {
        designatorPrefix: 'R',
        name: 'Resistor Pull-Up Data DHT',
        spec: '10kΩ 1/4W',
        footprint: 'AXIAL-0.4',
        note: 'Wajib jika memakai sensor DHT22 bare 4-pin (sudah terintegrasi di modul PCB)',
      },
    ],
  },
  {
    id: 'bme280',
    name: 'Sensor BME280 / BMP280 (I2C)',
    shortName: 'BME280 I2C',
    category: 'sensor',
    description: 'Sensor tekanan udara, suhu & kelembaban presisi tinggi via bus I2C',
    footprint: 'HDR-1x4-2.54',
    widthMm: 15,
    heightMm: 16,
    voltage: '3.3V',
    pins: [
      { id: 'VCC', label: '3V3', dx: 3.69, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'power_3v3' },
      { id: 'GND', label: 'GND', dx: 3.69 + P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'SCL', label: 'SCL', dx: 3.69 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'i2c_scl' },
      { id: 'SDA', label: 'SDA', dx: 3.69 + 3 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'i2c_sda' },
    ],
  },
  {
    id: 'oled-ssd1306',
    name: 'Layar OLED 0.96" SSD1306 (I2C)',
    shortName: 'OLED 0.96"',
    category: 'sensor',
    description: 'Display grafis 128×64 I2C 4-pin (GND, VCC, SCL, SDA)',
    footprint: 'OLED-096-I2C',
    widthMm: 27,
    heightMm: 27,
    voltage: '3.3V-5V',
    pins: [
      { id: 'GND', label: 'GND', dx: 9.69, dy: 3.5, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'VCC', label: 'VCC', dx: 9.69 + P, dy: 3.5, drillMm: 0.9, padMm: 1.7, type: 'power_3v3' },
      { id: 'SCL', label: 'SCL', dx: 9.69 + 2 * P, dy: 3.5, drillMm: 0.9, padMm: 1.7, type: 'i2c_scl' },
      { id: 'SDA', label: 'SDA', dx: 9.69 + 3 * P, dy: 3.5, drillMm: 0.9, padMm: 1.7, type: 'i2c_sda' },
    ],
  },
  {
    id: 'hcsr04',
    name: 'Sensor Ultrasonik HC-SR04',
    shortName: 'HC-SR04',
    category: 'sensor',
    description: 'Pengukur jarak non-kontak 2cm–400cm (VCC, TRIG, ECHO, GND)',
    footprint: 'HDR-1x4-2.54',
    widthMm: 24,
    heightMm: 18,
    voltage: '5V',
    pins: [
      { id: 'VCC', label: '5V', dx: 8.19, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'power_5v' },
      { id: 'TRIG', label: 'TRIG', dx: 8.19 + P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gpio' },
      { id: 'ECHO', label: 'ECHO', dx: 8.19 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gpio' },
      { id: 'GND', label: 'GND', dx: 8.19 + 3 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
    ],
  },
  {
    id: 'pir-hcsr501',
    name: 'Sensor Gerak PIR HC-SR501',
    shortName: 'PIR Gerak',
    category: 'sensor',
    description: 'Detektor inframerah pasif manusia untuk lampu/keamanan otomatis',
    footprint: 'HDR-1x3-2.54',
    widthMm: 16,
    heightMm: 16,
    voltage: '5V',
    pins: [
      { id: 'VCC', label: '5V', dx: 5.46, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'power_5v' },
      { id: 'OUT', label: 'OUT', dx: 5.46 + P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gpio' },
      { id: 'GND', label: 'GND', dx: 5.46 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
    ],
  },
  {
    id: 'soil-moisture',
    name: 'Sensor Kelembaban Tanah (Analog)',
    shortName: 'Soil Moisture',
    category: 'sensor',
    description: 'Pembaca kadar air tanah kapasitif/resistif output Analog ADC',
    footprint: 'HDR-1x3-2.54',
    widthMm: 15,
    heightMm: 14,
    voltage: '3.3V-5V',
    pins: [
      { id: 'VCC', label: 'VCC', dx: 4.96, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'power_3v3' },
      { id: 'GND', label: 'GND', dx: 4.96 + P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'AOUT', label: 'AOUT', dx: 4.96 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'adc' },
    ],
  },
  {
    id: 'mq2-gas',
    name: 'Sensor Gas & Asap MQ-2 / MQ-135',
    shortName: 'Sensor Gas MQ-2',
    category: 'sensor',
    description: 'Deteksi kebocoran LPG, metana, asap via output Analog & Digital',
    footprint: 'HDR-1x4-2.54',
    widthMm: 18,
    heightMm: 18,
    voltage: '5V',
    pins: [
      { id: 'VCC', label: '5V', dx: 5.19, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'power_5v' },
      { id: 'GND', label: 'GND', dx: 5.19 + P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'DO', label: 'DOUT', dx: 5.19 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gpio' },
      { id: 'AO', label: 'AOUT', dx: 5.19 + 3 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'adc' },
    ],
  },
  {
    id: 'ds18b20',
    name: 'Sensor Suhu DS18B20 (1-Wire)',
    shortName: 'DS18B20',
    category: 'sensor',
    description: 'Sensor suhu tahan air digital 1-Wire (membutuhkan pull-up 4.7kΩ)',
    footprint: 'HDR-1x3-2.54',
    widthMm: 14,
    heightMm: 14,
    voltage: '3.3V-5V',
    pins: [
      { id: 'GND', label: 'GND', dx: 4.46, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'DQ', label: 'DQ', dx: 4.46 + P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'gpio' },
      { id: 'VCC', label: '3V3', dx: 4.46 + 2 * P, dy: 4, drillMm: 0.9, padMm: 1.7, type: 'power_3v3' },
    ],
    supportParts: [
      {
        designatorPrefix: 'R',
        name: 'Resistor Pull-Up 1-Wire DS18B20',
        spec: '4.7kΩ 1/4W',
        footprint: 'AXIAL-0.4',
        note: 'Hubungkan antara pin DQ dan VCC 3.3V/5V',
      },
    ],
  },

  // ================= TOMBOL TACTILE & INDIKATOR =================
  {
    id: 'tactile-btn',
    name: 'Tombol Tactile 6×6mm (Push Button)',
    shortName: 'Tactile 6×6mm',
    category: 'tactile',
    description: 'Switch momentary 4-pin THT standar (jarak kaki 6.5mm × 4.5mm)',
    footprint: 'SW-TACT-6x6mm',
    widthMm: 10,
    heightMm: 10,
    voltage: '3.3V-5V',
    pins: [
      { id: 'SIG', label: 'GPIO', dx: 1.75, dy: 2.75, drillMm: 1.0, padMm: 1.8, type: 'gpio' },
      { id: 'GND', label: 'GND', dx: 8.25, dy: 7.25, drillMm: 1.0, padMm: 1.8, type: 'gnd' },
    ],
    supportParts: [
      {
        designatorPrefix: 'R',
        name: 'Resistor Pull-Up (Opsional jika non-INTERNAL_PULLUP)',
        spec: '10kΩ 1/4W',
        footprint: 'AXIAL-0.4',
        note: 'Bisa diaktifkan via pinMode(PIN, INPUT_PULLUP) di kode',
      },
    ],
  },
  {
    id: 'rotary-ec11',
    name: 'Rotary Encoder EC11 + Tombol',
    shortName: 'Rotary EC11',
    category: 'tactile',
    description: 'Knob putar 5-pin (CLK, DT, SW, +, GND) untuk menu OLED & dimmer',
    footprint: 'ENC-EC11-5P',
    widthMm: 16,
    heightMm: 16,
    voltage: '3.3V-5V',
    pins: [
      { id: 'CLK', label: 'CLK', dx: 3, dy: 3, drillMm: 1.0, padMm: 1.7, type: 'gpio' },
      { id: 'GND', label: 'GND', dx: 8, dy: 3, drillMm: 1.0, padMm: 1.7, type: 'gnd' },
      { id: 'DT', label: 'DT', dx: 13, dy: 3, drillMm: 1.0, padMm: 1.7, type: 'gpio' },
      { id: 'SW', label: 'SW', dx: 5, dy: 13, drillMm: 1.0, padMm: 1.7, type: 'gpio' },
      { id: 'VCC', label: '3V3', dx: 11, dy: 13, drillMm: 1.0, padMm: 1.7, type: 'power_3v3' },
    ],
  },
  {
    id: 'led-5mm',
    name: 'LED Indikator 5mm + Resistor 220Ω',
    shortName: 'LED Indikator',
    category: 'tactile',
    description: 'LED status 5mm THT pitch 2.54mm (Anoda GPIO, Katoda GND)',
    footprint: 'LED-5MM',
    widthMm: 9,
    heightMm: 9,
    voltage: '3.3V-5V',
    pins: [
      { id: 'A', label: 'ANODA', dx: 3.23, dy: 4.5, drillMm: 0.9, padMm: 1.7, type: 'gpio' },
      { id: 'K', label: 'KATODA', dx: 5.77, dy: 4.5, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
    ],
    supportParts: [
      {
        designatorPrefix: 'R',
        name: 'Resistor Pembatas Arus LED',
        spec: '220Ω 1/4W',
        footprint: 'AXIAL-0.4',
        note: 'Seri di jalur Anoda LED agar GPIO MCU aman',
      },
    ],
  },

  // ================= KONEKTOR & TERMINAL =================
  {
    id: 'term-2p',
    name: 'Terminal Blok KF301 2-Pin (Power 5V)',
    shortName: 'Terminal 2P 5V',
    category: 'connector',
    description: 'Screw terminal pitch 5.08mm untuk input catu daya 5V DC & GND',
    footprint: 'KF301-2P-5.08',
    widthMm: 12,
    heightMm: 10,
    voltage: '5V',
    pins: [
      { id: 'VCC', label: '+5V', dx: 3.46, dy: 5, drillMm: 1.2, padMm: 2.4, type: 'power_5v' },
      { id: 'GND', label: 'GND', dx: 8.54, dy: 5, drillMm: 1.2, padMm: 2.4, type: 'gnd' },
    ],
  },
  {
    id: 'term-3p',
    name: 'Terminal Blok KF301 3-Pin (Eksternal)',
    shortName: 'Terminal 3P',
    category: 'connector',
    description: 'Screw terminal 3-pin pitch 5.08mm (VCC, DATA, GND) untuk kabel panjang',
    footprint: 'KF301-3P-5.08',
    widthMm: 17,
    heightMm: 10,
    voltage: '5V',
    pins: [
      { id: 'VCC', label: '5V', dx: 3.42, dy: 5, drillMm: 1.2, padMm: 2.4, type: 'power_5v' },
      { id: 'SIG', label: 'SIG', dx: 8.5, dy: 5, drillMm: 1.2, padMm: 2.4, type: 'gpio' },
      { id: 'GND', label: 'GND', dx: 13.58, dy: 5, drillMm: 1.2, padMm: 2.4, type: 'gnd' },
    ],
  },
  {
    id: 'jst-4p',
    name: 'Konektor JST-XH 4-Pin (I2C / UART)',
    shortName: 'JST-XH 4P I2C',
    category: 'connector',
    description: 'Konektor modular 4-pin pitch 2.54mm untuk ekspansi sensor I2C eksternal',
    footprint: 'JST-XH-4P',
    widthMm: 14,
    heightMm: 10,
    voltage: '3.3V',
    pins: [
      { id: 'VCC', label: '3V3', dx: 3.19, dy: 5, drillMm: 0.9, padMm: 1.7, type: 'power_3v3' },
      { id: 'GND', label: 'GND', dx: 3.19 + P, dy: 5, drillMm: 0.9, padMm: 1.7, type: 'gnd' },
      { id: 'SCL', label: 'SCL', dx: 3.19 + 2 * P, dy: 5, drillMm: 0.9, padMm: 1.7, type: 'i2c_scl' },
      { id: 'SDA', label: 'SDA', dx: 3.19 + 3 * P, dy: 5, drillMm: 0.9, padMm: 1.7, type: 'i2c_sda' },
    ],
  },
  {
    id: 'barrel-dc',
    name: 'Jack Power DC Barrel 5.5×2.1mm',
    shortName: 'DC Jack 5V',
    category: 'connector',
    description: 'Soket adaptor DC 5V teregulasi untuk power supply papan PCB',
    footprint: 'DC-JACK-PJ002',
    widthMm: 12,
    heightMm: 15,
    voltage: '5V',
    pins: [
      { id: 'VCC', label: '+5V', dx: 6, dy: 3, drillMm: 1.3, padMm: 2.6, type: 'power_5v' },
      { id: 'GND', label: 'GND', dx: 6, dy: 11, drillMm: 1.3, padMm: 2.6, type: 'gnd' },
    ],
  },
];

export const CATALOG_MAP: Record<string, ComponentDef> = Object.fromEntries(
  COMPONENT_CATALOG.map((c) => [c.id, c])
);

export interface ProjectPreset {
  id: string;
  name: string;
  description: string;
  componentIds: string[];
  boardWidthMm: number;
  boardHeightMm: number;
}

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: 'smart-relay-dht',
    name: 'Smart Home Relay + DHT22 + Tombol',
    description: 'ESP32 mengontrol Relay 1-CH, membaca suhu DHT22, tombol manual, LED, dan terminal daya 5V.',
    componentIds: ['esp32-devkit', 'relay-1ch', 'dht22', 'tactile-btn', 'led-5mm', 'term-2p'],
    boardWidthMm: 95,
    boardHeightMm: 72,
  },
  {
    id: 'water-level-oled',
    name: 'Monitor Tangki Ultrasonik + OLED + Buzzer',
    description: 'ESP32 + HC-SR04 mengukur jarak air, tampil ke OLED 0.96" I2C, alarm buzzer & terminal power.',
    componentIds: ['esp32-devkit', 'hcsr04', 'oled-ssd1306', 'buzzer-5v', 'tactile-btn', 'term-2p'],
    boardWidthMm: 100,
    boardHeightMm: 75,
  },
  {
    id: 'arduino-garden',
    name: 'Penyiram Tanaman Otomatis Arduino Nano',
    description: 'Arduino Nano membaca sensor tanah analog & BME280 I2C, memicu MOSFET/Relay pompa + LED.',
    componentIds: ['arduino-nano', 'soil-moisture', 'bme280', 'relay-1ch', 'led-5mm', 'barrel-dc'],
    boardWidthMm: 92,
    boardHeightMm: 70,
  },
];

export const SAMPLE_SKETCHES: { id: string; title: string; code: string }[] = [
  {
    id: 'esp32-smart-relay',
    title: 'ESP32 Smart Relay + DHT22 + OLED + Tombol',
    code: `#include <WiFi.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_SSD1306.h>

#define DHTPIN 4
#define DHTTYPE DHT22
#define RELAY_PIN 26
#define BTN_PIN 13
#define LED_PIN 2
#define BUZZER_PIN 27

DHT dht(DHTPIN, DHTTYPE);
Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BTN_PIN, INPUT_PULLUP);
  dht.begin();
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}

void loop() {
  float t = dht.readTemperature();
  if (digitalRead(BTN_PIN) == LOW || t > 32.0) {
    digitalWrite(RELAY_PIN, HIGH);
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(RELAY_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
  }
  delay(500);
}`,
  },
  {
    id: 'arduino-gas-alarm',
    title: 'Arduino Nano Alarm Gas MQ-2 + Relay + Buzzer',
    code: `#include <Arduino.h>

const int MQ2_AOUT = A0;
const int MQ2_DOUT = 4;
const int RELAY_FAN = 7;
const int BUZZER_PIN = 9;
const int BTN_RESET = 2;
const int LED_ALERT = 13;

void setup() {
  pinMode(MQ2_DOUT, INPUT);
  pinMode(BTN_RESET, INPUT_PULLUP);
  pinMode(RELAY_FAN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_ALERT, OUTPUT);
}

void loop() {
  int gasVal = analogRead(MQ2_AOUT);
  if (gasVal > 450) {
    digitalWrite(RELAY_FAN, HIGH);
    tone(BUZZER_PIN, 2000);
    digitalWrite(LED_ALERT, HIGH);
  } else if (digitalRead(BTN_RESET) == LOW) {
    digitalWrite(RELAY_FAN, LOW);
    noTone(BUZZER_PIN);
    digitalWrite(LED_ALERT, LOW);
  }
}`,
  },
  {
    id: 'esp32-ultrasonic-tank',
    title: 'ESP32 Sensor Ultrasonik HC-SR04 + Pump Relay + BME280',
    code: `#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_BME280.h>

#define TRIG_PIN 18
#define ECHO_PIN 19
#define RELAY_PUMP 25
#define SOIL_ADC 34

Adafruit_BME280 bme;

void setup() {
  Wire.begin(21, 22);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RELAY_PUMP, OUTPUT);
  bme.begin(0x76);
}

void loop() {
  int moisture = analogRead(SOIL_ADC);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  if (moisture < 1500) {
    digitalWrite(RELAY_PUMP, HIGH);
  } else {
    digitalWrite(RELAY_PUMP, LOW);
  }
}`,
  },
];
