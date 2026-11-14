import React from 'react';
import { Download } from 'lucide-react';
import { BomItem, NetConnection } from '../types/pcb';
import { exportBomCsv } from '../utils/gerberExport';

interface BomTableProps {
  bom: BomItem[];
  connections: NetConnection[];
  projectName: string;
}

export const BomTable: React.FC<BomTableProps> = ({
  bom,
  connections,
  projectName,
}) => {
  const totalQty = bom.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#080B10]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-800/80 bg-[#0D1119]">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Daftar Komponen Perakitan (Bill of Materials)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {bom.length} Jenis Item · Total {totalQty} Unit (termasuk resistor pendukung & socket header)
          </p>
        </div>

        <button
          onClick={() => exportBomCsv(bom, projectName)}
          disabled={bom.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Unduh BOM (.CSV)
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-6">
        {bom.length === 0 ? (
          <div className="p-8 text-center border border-slate-800 rounded-lg bg-[#0D1119] text-sm text-slate-400">
            Belum ada komponen di papan PCB. Pilih komponen dari panel kiri atau gunakan kode sketch.
          </div>
        ) : (
          <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#0D1119]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                  <th className="py-2.5 px-3 font-medium">No</th>
                  <th className="py-2.5 px-3 font-medium">Designator</th>
                  <th className="py-2.5 px-3 font-medium">Nama Komponen</th>
                  <th className="py-2.5 px-3 font-medium">Nilai / Tegangan</th>
                  <th className="py-2.5 px-3 font-medium">Footprint PCB</th>
                  <th className="py-2.5 px-3 font-medium text-right">Qty</th>
                  <th className="py-2.5 px-3 font-medium">Catatan Perakitan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {bom.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-3 font-mono-tabular text-slate-500">
                      {String(idx + 1).padStart(2, '0')}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-cyan-300 font-medium">
                      {item.designators.join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-slate-100 font-medium">
                      {item.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-amber-300">
                      {item.spec}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-slate-300">
                      {item.footprint}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-right font-semibold text-slate-100">
                      {item.qty}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Netlist Wiring Reference Table */}
        {connections.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">
              Tabel Koneksi Jalur Tembaga (Netlist · {connections.length} Jalur)
            </h3>
            <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#0D1119]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                    <th className="py-2 px-3 font-medium">Nama Net</th>
                    <th className="py-2 px-3 font-medium">Tipe</th>
                    <th className="py-2 px-3 font-medium">Pin Asal</th>
                    <th className="py-2 px-3 font-medium">Pin Tujuan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {connections.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-900/40">
                      <td className="py-2 px-3 font-mono-tabular text-cyan-300">
                        {c.netName}
                      </td>
                      <td className="py-2 px-3 text-slate-400 uppercase font-mono-tabular">
                        {c.netType}
                      </td>
                      <td className="py-2 px-3 font-mono-tabular text-slate-200">
                        {c.fromDesignator} · {c.fromPinLabel}
                      </td>
                      <td className="py-2 px-3 font-mono-tabular text-slate-200">
                        {c.toDesignator} · {c.toPinLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
