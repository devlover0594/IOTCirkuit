import React, { useState } from 'react';
import { Check, Copy, Cpu, Play, Sparkles, Upload } from 'lucide-react';
import { SAMPLE_SKETCHES } from '../data/catalog';
import { ParsedPinSymbol } from '../utils/sketchParser';

interface SketchPanelProps {
  code: string;
  onChangeCode: (val: string) => void;
  onAnalyzeAndBuild: (code: string) => void;
  onGenerateFromCurrentPcb: () => void;
  lastExtractedPins: ParsedPinSymbol[];
  lastDetectedLibs: string[];
}

export const SketchPanel: React.FC<SketchPanelProps> = ({
  code,
  onChangeCode,
  onAnalyzeAndBuild,
  onGenerateFromCurrentPcb,
  lastExtractedPins,
  lastDetectedLibs,
}) => {
  const [copied, setCopied] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeCode(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden bg-[#080B10]">
      {/* Code Editor Column */}
      <div className="flex-1 flex flex-col min-w-0 border-b lg:border-b-0 lg:border-r border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80 bg-[#0D1119]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-200">
              Kode Sketch Arduino / C++ (.ino / .cpp)
            </span>
            <select
              onChange={(e) => {
                const sample = SAMPLE_SKETCHES.find((s) => s.id === e.target.value);
                if (sample) onChangeCode(sample.code);
              }}
              defaultValue=""
              className="px-2.5 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="" disabled>
                Muat Contoh Sketch...
              </option>
              {SAMPLE_SKETCHES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              Buka .ino / .cpp
              <input
                type="file"
                accept=".ino,.cpp,.c,.h,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
            <button
              onClick={onGenerateFromCurrentPcb}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              title="Buat kode C++ dari susunan komponen PCB saat ini"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Ambil dari PCB
            </button>
            <button
              onClick={() => onAnalyzeAndBuild(code)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              Generate PCB Otomatis
            </button>
          </div>
        </div>

        <textarea
          value={code}
          onChange={(e) => onChangeCode(e.target.value)}
          spellCheck={false}
          placeholder="Tempel kode Arduino / ESP32 .ino atau .cpp Anda di sini..."
          className="flex-1 w-full p-4 bg-[#080B10] text-slate-200 font-mono-tabular text-xs leading-6 resize-none focus:outline-none"
        />
      </div>

      {/* Extraction & Mapping Summary Column */}
      <div className="w-full lg:w-[360px] flex flex-col bg-[#0D1119] shrink-0 overflow-y-auto">
        <div className="px-4 py-3 border-b border-slate-800/80">
          <h3 className="text-sm font-semibold text-slate-100">
            Hasil Analisis Pin & Komponen
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Sistem membaca <code className="text-cyan-300">#include</code>,{' '}
            <code className="text-cyan-300">#define</code>, serta deklarasi pin GPIO untuk menyusun PCB dan diagram Mermaid otomatis.
          </p>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <div className="text-xs font-medium text-slate-400 mb-2">
              Library Terdeteksi ({lastDetectedLibs.length})
            </div>
            {lastDetectedLibs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Klik "Generate PCB Otomatis" untuk mengekstrak library dan pin dari kode.
              </p>
            ) : (
              <div className="text-xs font-mono-tabular text-slate-300 space-y-1">
                {lastDetectedLibs.map((lib, idx) => (
                  <div key={`${lib}-${idx}`} className="py-1 border-b border-slate-800/60">
                    {lib}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-slate-400 mb-2">
              Pemetaan Pin GPIO ({lastExtractedPins.length})
            </div>
            {lastExtractedPins.length === 0 ? (
              <div className="p-3 rounded-md border border-slate-800 bg-slate-900/50 text-xs text-slate-400 flex items-start gap-2">
                <Cpu className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span>
                  Belum ada pemetaan hasil parsing. Pilih contoh sketch atau tempel kode Anda lalu klik Generate PCB Otomatis.
                </span>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-md overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-2.5 font-medium">Simbol</th>
                      <th className="py-2 px-2.5 font-medium">Pin</th>
                      <th className="py-2 px-2.5 font-medium">Modul</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {lastExtractedPins.map((item, i) => (
                      <tr key={`${item.symbol}-${i}`} className="hover:bg-slate-900/40">
                        <td className="py-2 px-2.5 font-mono-tabular text-cyan-300">
                          {item.symbol}
                        </td>
                        <td className="py-2 px-2.5 font-mono-tabular text-amber-300 font-semibold">
                          {item.pinValue}
                        </td>
                        <td className="py-2 px-2.5 text-slate-300">{item.detectedRole}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
