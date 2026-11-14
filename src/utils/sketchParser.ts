import { CATALOG_MAP } from '../data/catalog';
import { NetConnection, PlacedComponent } from '../types/pcb';

export interface ParsedPinSymbol {
  symbol: string;
  pinValue: string;
  detectedRole: string;
}

export interface SketchParseResult {
  mcuId: string;
  componentIds: string[];
  pinOverridesList: Array<Record<string, string> | undefined>;
  extractedPins: ParsedPinSymbol[];
  detectedLibraries: string[];
}

export function parseArduinoSketch(code: string): SketchParseResult {
  const upper = code.toUpperCase();

  // 1. Extract #include libraries
  const detectedLibraries: string[] = [];
  const includeRegex = /#include\s+[<"]([^>"]+)[>"]/g;
  let incMatch: RegExpExecArray | null;
  while ((incMatch = includeRegex.exec(code)) !== null) {
    detectedLibraries.push(incMatch[1]);
  }

  // 2. Extract #define & const int / int pin declarations
  const symbolMap = new Map<string, string>();
  const extractedPins: ParsedPinSymbol[] = [];

  const defineRegex = /^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z0-9_]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = defineRegex.exec(code)) !== null) {
    const name = m[1];
    const val = m[2];
    if (/^(A?\d+|D\d+|GPIO\d+)$/i.test(val) && !/TYPE|ADDR|WIDTH|HEIGHT|BAUD|DELAY/i.test(name)) {
      symbolMap.set(name.toUpperCase(), val.toUpperCase());
    }
  }

  const varRegex = /^\s*(?:const\s+)?(?:uint8_t|int|byte)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z0-9_]+)\s*;/gm;
  while ((m = varRegex.exec(code)) !== null) {
    const name = m[1];
    const val = m[2];
    if (/^(A?\d+|D\d+|GPIO\d+)$/i.test(val) && !/VAL|STATE|COUNT|TIME|DELAY|THRESH/i.test(name)) {
      symbolMap.set(name.toUpperCase(), val.toUpperCase());
    }
  }

  // 3. Determine MCU
  let mcuId = 'esp32-devkit';
  if (upper.includes('ESP8266WIFI') || upper.includes('NODEMCU') || /\bD[0-8]\b/.test(upper)) {
    mcuId = 'esp8266-nodemcu';
  } else if (
    upper.includes('WIFI.H') ||
    upper.includes('ESP32') ||
    Array.from(symbolMap.values()).some((v) => {
      const n = parseInt(v.replace(/\D/g, ''), 10);
      return !isNaN(n) && n >= 14 && !v.startsWith('A');
    })
  ) {
    mcuId = 'esp32-devkit';
  } else if (upper.includes('ARDUINO.H') || Array.from(symbolMap.values()).some((v) => /^A[0-5]$/.test(v) || parseInt(v, 10) <= 13)) {
    mcuId = 'arduino-nano';
  }

  const componentIds: string[] = [mcuId];
  const pinOverridesList: Array<Record<string, string> | undefined> = [undefined];

  const addComponent = (id: string, overrides?: Record<string, string>) => {
    componentIds.push(id);
    pinOverridesList.push(overrides);
  };

  // Helper to find symbol matching patterns
  const findPinByKeywords = (keywords: string[]): { key: string; pin: string } | undefined => {
    for (const [k, v] of symbolMap.entries()) {
      if (keywords.some((kw) => k.includes(kw))) {
        return { key: k, pin: v };
      }
    }
    return undefined;
  };

  const usedSymbols = new Set<string>();

  // 4. Match Sensors & Libraries
  if (upper.includes('DHT.H') || upper.includes('DHTPIN') || upper.includes('DHT_PIN') || upper.includes('DHT22') || upper.includes('DHT11')) {
    const found = findPinByKeywords(['DHTPIN', 'DHT_PIN', 'DHT']);
    if (found) {
      usedSymbols.add(found.key);
      extractedPins.push({ symbol: found.key, pinValue: found.pin, detectedRole: 'Sensor DHT22/11 (DATA)' });
    }
    addComponent('dht22', found ? { DATA: found.pin } : undefined);
  }

  if (upper.includes('SSD1306') || upper.includes('U8G2') || upper.includes('DISPLAY.BEGIN')) {
    extractedPins.push({ symbol: 'I2C Bus', pinValue: mcuId === 'arduino-nano' ? 'A4/A5' : '21/22', detectedRole: 'OLED 0.96" SSD1306 (SDA/SCL)' });
    addComponent('oled-ssd1306');
  }

  if (upper.includes('BME280') || upper.includes('BMP280')) {
    extractedPins.push({ symbol: 'I2C Bus', pinValue: mcuId === 'arduino-nano' ? 'A4/A5' : '21/22', detectedRole: 'Sensor BME280/BMP280 (SDA/SCL)' });
    addComponent('bme280');
  }

  if (upper.includes('DALLASTEMPERATURE') || upper.includes('ONEWIRE') || upper.includes('DS18B20')) {
    const found = findPinByKeywords(['ONE_WIRE', 'ONEWIRE', 'DS18B20', 'TEMP_PIN']);
    if (found) {
      usedSymbols.add(found.key);
      extractedPins.push({ symbol: found.key, pinValue: found.pin, detectedRole: 'Sensor Suhu DS18B20 (DQ)' });
    }
    addComponent('ds18b20', found ? { DQ: found.pin } : undefined);
  }

  const trig = findPinByKeywords(['TRIG']);
  const echo = findPinByKeywords(['ECHO']);
  if (trig || echo || upper.includes('HCSR04') || upper.includes('ULTRASONIC')) {
    const overrides: Record<string, string> = {};
    if (trig) {
      usedSymbols.add(trig.key);
      overrides.TRIG = trig.pin;
      extractedPins.push({ symbol: trig.key, pinValue: trig.pin, detectedRole: 'Ultrasonik HC-SR04 (TRIG)' });
    }
    if (echo) {
      usedSymbols.add(echo.key);
      overrides.ECHO = echo.pin;
      extractedPins.push({ symbol: echo.key, pinValue: echo.pin, detectedRole: 'Ultrasonik HC-SR04 (ECHO)' });
    }
    addComponent('hcsr04', Object.keys(overrides).length ? overrides : undefined);
  }

  const pir = findPinByKeywords(['PIR', 'MOTION']);
  if (pir) {
    usedSymbols.add(pir.key);
    extractedPins.push({ symbol: pir.key, pinValue: pir.pin, detectedRole: 'Sensor Gerak PIR (OUT)' });
    addComponent('pir-hcsr501', { OUT: pir.pin });
  }

  const mq2Ao = findPinByKeywords(['MQ2_A', 'MQ_A', 'GAS_A', 'MQ135']);
  const mq2Do = findPinByKeywords(['MQ2_D', 'MQ_D', 'GAS_D']);
  if (mq2Ao || mq2Do || upper.includes('MQ2') || upper.includes('MQ-2')) {
    const ov: Record<string, string> = {};
    if (mq2Ao) {
      usedSymbols.add(mq2Ao.key);
      ov.AO = mq2Ao.pin;
      extractedPins.push({ symbol: mq2Ao.key, pinValue: mq2Ao.pin, detectedRole: 'Sensor Gas MQ-2 (AOUT)' });
    }
    if (mq2Do) {
      usedSymbols.add(mq2Do.key);
      ov.DO = mq2Do.pin;
      extractedPins.push({ symbol: mq2Do.key, pinValue: mq2Do.pin, detectedRole: 'Sensor Gas MQ-2 (DOUT)' });
    }
    addComponent('mq2-gas', Object.keys(ov).length ? ov : undefined);
  }

  const soil = findPinByKeywords(['SOIL', 'MOISTURE', 'LDR', 'ADC']);
  if (soil) {
    usedSymbols.add(soil.key);
    extractedPins.push({ symbol: soil.key, pinValue: soil.pin, detectedRole: 'Sensor Kelembaban Tanah (AOUT)' });
    addComponent('soil-moisture', { AOUT: soil.pin });
  }

  // 5. Match Actuators (Relays, Buzzer, MOSFET)
  const relayPins: Array<{ key: string; pin: string }> = [];
  for (const [k, v] of symbolMap.entries()) {
    if (!usedSymbols.has(k) && (k.includes('RELAY') || k.includes('PUMP') || k.includes('FAN') || k.includes('LAMP'))) {
      relayPins.push({ key: k, pin: v });
      usedSymbols.add(k);
    }
  }
  if (relayPins.length >= 2) {
    extractedPins.push({ symbol: relayPins[0].key, pinValue: relayPins[0].pin, detectedRole: 'Relay 2-CH (IN1)' });
    extractedPins.push({ symbol: relayPins[1].key, pinValue: relayPins[1].pin, detectedRole: 'Relay 2-CH (IN2)' });
    addComponent('relay-2ch', { IN1: relayPins[0].pin, IN2: relayPins[1].pin });
  } else if (relayPins.length === 1) {
    extractedPins.push({ symbol: relayPins[0].key, pinValue: relayPins[0].pin, detectedRole: 'Relay 1-CH (IN)' });
    addComponent('relay-1ch', { IN: relayPins[0].pin });
  }

  const mosfet = findPinByKeywords(['MOSFET', 'PWM_LOAD', 'FET']);
  if (mosfet && !usedSymbols.has(mosfet.key)) {
    usedSymbols.add(mosfet.key);
    extractedPins.push({ symbol: mosfet.key, pinValue: mosfet.pin, detectedRole: 'Driver MOSFET (GATE)' });
    addComponent('mosfet-irlz44n', { GATE: mosfet.pin });
  }

  const buzzer = findPinByKeywords(['BUZZER', 'BUZZ', 'ALARM', 'SPK']);
  if (buzzer && !usedSymbols.has(buzzer.key)) {
    usedSymbols.add(buzzer.key);
    extractedPins.push({ symbol: buzzer.key, pinValue: buzzer.pin, detectedRole: 'Buzzer 5V (+)' });
    addComponent('buzzer-5v', { SIG: buzzer.pin });
  }

  // 6. Match Buttons & LEDs
  for (const [k, v] of symbolMap.entries()) {
    if (usedSymbols.has(k)) continue;
    if (k.includes('BTN') || k.includes('BUTTON') || k.includes('SW') || k.includes('TOMBOL')) {
      usedSymbols.add(k);
      extractedPins.push({ symbol: k, pinValue: v, detectedRole: 'Tombol Tactile 6×6mm' });
      addComponent('tactile-btn', { SIG: v });
    } else if (k.includes('LED')) {
      usedSymbols.add(k);
      extractedPins.push({ symbol: k, pinValue: v, detectedRole: 'LED Indikator 5mm' });
      addComponent('led-5mm', { A: v });
    }
  }

  // 7. Always add Power Terminal KF301 2-Pin if no connector exists
  addComponent('term-2p');

  return {
    mcuId,
    componentIds,
    pinOverridesList,
    extractedPins,
    detectedLibraries,
  };
}

export function generateSketchFromBoard(
  placed: PlacedComponent[],
  connections: NetConnection[]
): string {
  const mcu = placed.find((p) => CATALOG_MAP[p.defId]?.category === 'mcu');
  if (!mcu) {
    return '// Tambahkan mikrokontroler (ESP32 / Arduino) terlebih dahulu untuk membuat kode sketch.';
  }

  const lines: string[] = [];
  const hasI2c = placed.some((p) => ['bme280', 'oled-ssd1306', 'jst-4p'].includes(p.defId));
  const hasDht = placed.some((p) => p.defId === 'dht22');
  const hasOled = placed.some((p) => p.defId === 'oled-ssd1306');
  const hasBme = placed.some((p) => p.defId === 'bme280');

  if (mcu.defId === 'esp32-devkit') {
    lines.push('#include <WiFi.h>');
  } else if (mcu.defId === 'esp8266-nodemcu') {
    lines.push('#include <ESP8266WiFi.h>');
  }
  if (hasI2c) lines.push('#include <Wire.h>');
  if (hasDht) lines.push('#include <DHT.h>');
  if (hasOled) lines.push('#include <Adafruit_SSD1306.h>');
  if (hasBme) lines.push('#include <Adafruit_BME280.h>');

  lines.push('');
  lines.push('// Definisi Pin Otomatis dari Tata Letak PCB');

  const signalConns = connections.filter((c) => c.netType === 'signal' || c.netType === 'adc');
  const setupLines: string[] = [];

  for (const conn of signalConns) {
    const cleanPin = conn.fromPinLabel.replace(/[^0-9A-Za-z]/g, '');
    const pinNumMatch = conn.fromPinLabel.match(/\d+/);
    const pinLiteral = conn.fromPinLabel.startsWith('A')
      ? conn.fromPinLabel.split(' ')[0]
      : pinNumMatch
      ? pinNumMatch[0]
      : cleanPin;

    const constName = `${conn.toDesignator}_${conn.toPinLabel.replace(/[^A-Za-z0-9]/g, '')}_PIN`.toUpperCase();
    lines.push(`#define ${constName} ${pinLiteral}`);

    const targetComp = placed.find((p) => p.uid === conn.toUid);
    if (targetComp?.defId === 'tactile-btn') {
      setupLines.push(`  pinMode(${constName}, INPUT_PULLUP);`);
    } else if (targetComp?.defId.includes('sensor') || conn.toPinLabel === 'ECHO' || conn.netType === 'adc') {
      setupLines.push(`  pinMode(${constName}, INPUT);`);
    } else {
      setupLines.push(`  pinMode(${constName}, OUTPUT);`);
    }
  }

  lines.push('');
  lines.push('void setup() {');
  lines.push('  Serial.begin(115200);');
  if (hasI2c) {
    lines.push(mcu.defId === 'esp32-devkit' ? '  Wire.begin(21, 22);' : '  Wire.begin();');
  }
  setupLines.forEach((l) => lines.push(l));
  lines.push('}');
  lines.push('');
  lines.push('void loop() {');
  lines.push('  // Logika kontrol perangkat keras PCB Anda di sini');
  lines.push('  delay(100);');
  lines.push('}');

  return lines.join('\n');
}
