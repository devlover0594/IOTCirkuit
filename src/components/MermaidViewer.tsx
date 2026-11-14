import React, { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import {
  Check,
  Copy,
  Download,
  Play,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  SAMPLE_JSON_IMPORT,
  SAMPLE_MERMAID_IMPORT,
} from '../utils/diagramImporter';
import { triggerDownload } from '../utils/gerberExport';

interface MermaidViewerProps {
  script: string;
  jsonString: string;
  projectName: string;
  activeSubTab: 'mermaid' | 'json';
  onChangeSubTab: (tab: 'mermaid' | 'json') => void;
  onImportMermaid: (mermaidText: string) => void;
  onImportJson: (jsonText: string) => void;
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  flowchart: {
    curve: 'basis',
    padding: 18,
    nodeSpacing: 45,
    rankSpacing: 65,
  },
  themeVariables: {
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontSize: '13px',
    darkMode: true,
    background: '#080B10',
    primaryColor: '#0f172a',
    primaryBorderColor: '#06b6d4',
    lineColor: '#64748b',
  },
});

export const MermaidViewer: React.FC<MermaidViewerProps> = ({
  script,
  jsonString,
  projectName,
  activeSubTab,
  onChangeSubTab,
  onImportMermaid,
  onImportJson,
}) => {
  const reactId = useId().replace(/:/g, '_');
  const [editedScript, setEditedScript] = useState(script);
  const [editedJson, setEditedJson] = useState(jsonString);
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEditedScript(script);
  }, [script]);

  useEffect(() => {
    setEditedJson(jsonString);
  }, [jsonString]);

  useEffect(() => {
    let cancelled = false;
    const renderDiagram = async () => {
      try {
        const renderId = `mermaid_svg_${reactId}_${Date.now()}`;
        const { svg } = await mermaid.render(renderId, editedScript);
        if (!cancelled) {
          setSvgHtml(svg);
          setErrorMsg(null);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Sintaks Mermaid tidak valid.'
          );
        }
      }
    };
    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [editedScript, reactId]);

  const activeContent = activeSubTab === 'mermaid' ? editedScript : editedJson;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadSource = () => {
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'diagram';
    if (activeSubTab === 'mermaid') {
      triggerDownload(
        new Blob([editedScript], { type: 'text/plain;charset=utf-8' }),
        `${safeName}_alur_koneksi.mmd`
      );
    } else {
      triggerDownload(
        new Blob([editedJson], { type: 'application/json;charset=utf-8' }),
        `${safeName}_skema.json`
      );
    }
  };

  const handleDownloadSvg = () => {
    if (!svgHtml) return;
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'diagram';
    triggerDownload(
      new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' }),
      `${safeName}_diagram_mermaid.svg`
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (file.name.toLowerCase().endsWith('.json')) {
          onChangeSubTab('json');
          setEditedJson(reader.result);
        } else {
          onChangeSubTab('mermaid');
          setEditedScript(reader.result);
        }
        setImportError(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRunImport = () => {
    setImportError(null);
    try {
      if (activeSubTab === 'mermaid') {
        onImportMermaid(editedScript);
      } else {
        onImportJson(editedJson);
      }
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Gagal membaca script diagram.'
      );
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden bg-[#080B10]">
      {/* Visual Diagram Canvas */}
      <div className="flex-1 flex flex-col min-w-0 border-b lg:border-b-0 lg:border-r border-slate-800/80">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800/80 bg-[#0D1119]">
          <div className="text-xs text-slate-400">
            <span className="text-slate-100 font-medium">Diagram Alur Koneksi Komponen</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>Visualisasi Mermaid & Impor Skema</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadSource}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {activeSubTab === 'mermaid' ? 'Unduh .MMD' : 'Unduh .JSON'}
            </button>
            <button
              onClick={handleDownloadSvg}
              disabled={!svgHtml}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh SVG
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-[#080B10]">
          {errorMsg ? (
            <div className="max-w-md p-4 rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-200 text-xs font-mono-tabular">
              {errorMsg}
            </div>
          ) : (
            <div
              className="w-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          )}
        </div>
      </div>

      {/* Script & JSON Import/Export Panel */}
      <div className="w-full lg:w-[410px] xl:w-[450px] flex flex-col bg-[#0D1119] shrink-0">
        {/* Sub-tabs: Mermaid vs JSON */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800/80">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-0.5">
            <button
              onClick={() => {
                onChangeSubTab('mermaid');
                setImportError(null);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeSubTab === 'mermaid'
                  ? 'bg-slate-800 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Script Mermaid (.mmd)
            </button>
            <button
              onClick={() => {
                onChangeSubTab('json');
                setImportError(null);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeSubTab === 'json'
                  ? 'bg-slate-800 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Diagram JSON (.json)
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="w-3 h-3" />
              Buka File
              <input
                type="file"
                accept=".mmd,.txt,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>
        </div>

        {/* Helper Actions Bar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800/60 bg-slate-900/40">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setImportError(null);
                if (activeSubTab === 'mermaid') {
                  setEditedScript(SAMPLE_MERMAID_IMPORT);
                } else {
                  setEditedJson(SAMPLE_JSON_IMPORT);
                }
              }}
              className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
            >
              Muat Contoh {activeSubTab === 'mermaid' ? 'Mermaid' : 'JSON'}
            </button>
            <button
              onClick={() => {
                setImportError(null);
                if (activeSubTab === 'mermaid') {
                  setEditedScript(script);
                } else {
                  setEditedJson(jsonString);
                }
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 rounded transition-colors whitespace-nowrap"
              title="Sinkronkan ulang dari papan PCB saat ini"
            >
              <RefreshCw className="w-3 h-3" />
              Sync PCB
            </button>
          </div>

          <button
            onClick={handleRunImport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            Generate PCB Otomatis
          </button>
        </div>

        {importError && (
          <div className="px-3 py-2 bg-rose-950/50 border-b border-rose-500/40 text-xs text-rose-200 font-mono-tabular">
            {importError}
          </div>
        )}

        <textarea
          value={activeContent}
          onChange={(e) => {
            setImportError(null);
            if (activeSubTab === 'mermaid') {
              setEditedScript(e.target.value);
            } else {
              setEditedJson(e.target.value);
            }
          }}
          spellCheck={false}
          placeholder={
            activeSubTab === 'mermaid'
              ? 'Tempel script Mermaid flowchart di sini (misal: ESP32 -->|GPIO26| Relay)...'
              : 'Tempel skema Diagram JSON di sini...'
          }
          className={`flex-1 w-full p-4 bg-[#080B10] font-mono-tabular text-xs leading-relaxed resize-none focus:outline-none ${
            activeSubTab === 'mermaid' ? 'text-cyan-200' : 'text-amber-200'
          }`}
        />
      </div>
    </div>
  );
};
