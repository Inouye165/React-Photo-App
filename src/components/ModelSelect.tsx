import React from "react";
import { MODEL_CATALOG, type ModelId } from "../config/modelCatalog";

type Props = { value: ModelId; onChange: (id: ModelId) => void; disabled?: boolean; compact?: boolean };

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="ml-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px]">{children}</span>;
}

export default function ModelSelect({ value, onChange, disabled, compact = false }: Props) {
  const selected = MODEL_CATALOG[value];
  if (compact) {
    return (
      <select
        id="model"
        className="text-xs rounded border px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value as ModelId)}
        disabled={disabled}
        title={selected?.help}
      >
        {Object.values(MODEL_CATALOG).map((m) => (
          <option key={m.id} value={m.id} disabled={m.available === false}>
            {m.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="model" className="text-sm font-medium">Model</label>
      <select
        id="model"
        className="border rounded-md p-2"
        value={value}
        onChange={(e) => onChange(e.target.value as ModelId)}
        disabled={disabled}
      >
        {Object.values(MODEL_CATALOG).map((m) => (
          <option key={m.id} value={m.id} disabled={m.available === false}>
            {m.label}{m.available === false ? " (unavailable)" : ""}
          </option>
        ))}
      </select>
      <div className="flex items-center text-xs text-gray-600">
        <span>{selected?.help}</span>
        {selected?.vision && <Badge>Vision</Badge>}
        {selected?.reasoning && <Badge>Reasoning</Badge>}
        {selected?.imageGen && <Badge>Image&nbsp;Gen</Badge>}
        <Badge>Qual {selected?.quality}</Badge>
        <Badge>Cost {selected?.cost}</Badge>
        <Badge>Speed {selected?.speed}</Badge>
      </div>
      {value === "gpt-image-1" && (
        <div className="mt-1 rounded-md border px-2 py-1 text-xs">
          This model outputs images; the current pipeline expects text. Use GPT-4o/4o-mini for analysis responses.
        </div>
      )}
    </div>
  );
}
