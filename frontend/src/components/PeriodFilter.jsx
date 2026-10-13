import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const MONTHS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

export function PeriodFilter({
  selectedYear,
  onSelectYear,
  periodType,        // 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'CUSTOM'
  onSelectPeriodType,
  startMonth,
  onSelectStartMonth,
  endMonth,
  onSelectEndMonth,
}) {
  const handlePresetChange = (preset) => {
    onSelectPeriodType(preset);
    if (preset === 'ALL') {
      onSelectStartMonth(1);
      onSelectEndMonth(12);
    } else if (preset === 'Q1') {
      onSelectStartMonth(1);
      onSelectEndMonth(3);
    } else if (preset === 'Q2') {
      onSelectStartMonth(4);
      onSelectEndMonth(6);
    } else if (preset === 'Q3') {
      onSelectStartMonth(7);
      onSelectEndMonth(9);
    } else if (preset === 'Q4') {
      onSelectStartMonth(10);
      onSelectEndMonth(12);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 bg-zinc-900/90 border border-zinc-800 rounded-lg p-2.5 text-xs">
      {/* Icono de Calendario */}
      <div className="flex items-center gap-1.5 text-zinc-400 font-medium pl-1">
        <Calendar className="h-3.5 w-3.5 text-zinc-400" />
        <span>Periodo:</span>
      </div>

      {/* Selector de Año */}
      <select
        value={selectedYear}
        onChange={(e) => onSelectYear(Number(e.target.value))}
        className="bg-zinc-800 border border-zinc-700/80 rounded px-2.5 py-1 text-zinc-100 font-medium focus:outline-none cursor-pointer"
      >
        <option value={2026}>2026</option>
        <option value={2025}>2025</option>
        <option value={2024}>2024</option>
      </select>

      {/* Botones de Preajustes Trimestrales / Anual */}
      <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-md border border-zinc-800">
        <button
          type="button"
          onClick={() => handlePresetChange('ALL')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            periodType === 'ALL'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Todo el año
        </button>
        <button
          type="button"
          onClick={() => handlePresetChange('Q1')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            periodType === 'Q1'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          1T
        </button>
        <button
          type="button"
          onClick={() => handlePresetChange('Q2')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            periodType === 'Q2'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          2T
        </button>
        <button
          type="button"
          onClick={() => handlePresetChange('Q3')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            periodType === 'Q3'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          3T
        </button>
        <button
          type="button"
          onClick={() => handlePresetChange('Q4')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            periodType === 'Q4'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          4T
        </button>
        <button
          type="button"
          onClick={() => onSelectPeriodType('CUSTOM')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            periodType === 'CUSTOM'
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Personalizado
        </button>
      </div>

      {/* Selectores de Meses Personalizados (ej. Desde Abril hasta Julio) */}
      {periodType === 'CUSTOM' && (
        <div className="flex items-center gap-1.5 pl-1">
          <span className="text-[11px] text-zinc-400">Desde:</span>
          <select
            value={startMonth}
            onChange={(e) => {
              const val = Number(e.target.value);
              onSelectStartMonth(val);
              if (val > endMonth) onSelectEndMonth(val);
            }}
            className="bg-zinc-800 border border-zinc-700/80 rounded px-2 py-1 text-zinc-200 focus:outline-none cursor-pointer text-xs"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <span className="text-[11px] text-zinc-400">Hasta:</span>
          <select
            value={endMonth}
            onChange={(e) => {
              const val = Number(e.target.value);
              onSelectEndMonth(val);
              if (val < startMonth) onSelectStartMonth(val);
            }}
            className="bg-zinc-800 border border-zinc-700/80 rounded px-2 py-1 text-zinc-200 focus:outline-none cursor-pointer text-xs"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
