import React from "react";
import { MODEL_CATALOG, type ModelId, DEFAULT_MODEL, type ModelInfo } from "../config/modelCatalog";
import { fetchModelAllowlist } from "../api";

type Props = { value: ModelId; onChange: (id: ModelId) => void; disabled?: boolean; compact?: boolean };

type Option = { id: ModelId; label: string; disabled: boolean; meta?: ModelInfo };

const arraysEqual = (a: ModelId[], b: ModelId[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="ml-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px]">{children}</span>;
}

export default function ModelSelect({ value, onChange, disabled, compact = false }: Props) {
  const fallbackModels = React.useMemo<ModelId[]>(() => Object.keys(MODEL_CATALOG) as ModelId[], []);
  const [models, setModels] = React.useState<ModelId[]>(fallbackModels);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string>("seed");
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchModelAllowlist()
      .then((payload: any) => {
        if (cancelled) return;
        const list: unknown[] = Array.isArray(payload?.models) ? payload.models : [];
        const sanitized = Array.from(new Set(
          list.filter((item: unknown): item is ModelId => typeof item === "string" && item.length > 0)
        )) as ModelId[];
        if (sanitized.length > 0) {
          setModels(prev => (arraysEqual(prev, sanitized) ? prev : sanitized));
        } else {
          setModels(prev => (arraysEqual(prev, fallbackModels) ? prev : fallbackModels));
        }
        setSource(typeof payload?.source === "string" ? payload.source : (sanitized.length > 0 ? "dynamic" : "fallback-server"));
        setUpdatedAt(typeof payload?.updatedAt === "string" ? payload.updatedAt : null);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setLoadError(err && typeof err.message === "string" ? err.message : "Failed to load models");
        setModels(prev => (arraysEqual(prev, fallbackModels) ? prev : fallbackModels));
        setSource("fallback-client-error");
        setUpdatedAt(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fallbackModels]);

  React.useEffect(() => {
    if (!models.length) return;
    if (value && models.includes(value)) return;
    const fallback = models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models[0];
    if (fallback && fallback !== value) {
      onChange(fallback);
    }
  }, [models, value, onChange]);

  const options = React.useMemo<Option[]>(() => {
    const seen = new Set<string>();
    const list: Option[] = [];
    for (const id of models) {
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const meta = MODEL_CATALOG[id];
      list.push({ id, label: meta?.label ?? id, disabled: meta?.available === false, meta });
    }
    if (value && !seen.has(value)) {
      const meta = MODEL_CATALOG[value];
      list.push({ id: value, label: meta?.label ?? value, disabled: false, meta });
    }
    return list;
  }, [models, value]);

  const selectedMeta = MODEL_CATALOG[value];
  const descriptiveHelp = selectedMeta?.help || "Choose a model for AI analysis.";

  const formattedUpdatedAt = React.useMemo(() => {
    if (!updatedAt) return null;
    const parsed = new Date(updatedAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleTimeString();
  }, [updatedAt]);

  const infoLine = React.useMemo(() => {
    if (loading) return "Loading models…";
    if (loadError) return `Using fallback models (${loadError})`;
    if (typeof source !== "string" || source.length === 0) return null;
    if (source.startsWith("dynamic")) return "Models synced with OpenAI allowlist.";
    if (source.startsWith("fallback")) return "Using fallback allowlist.";
    if (source === "auth") return "Authenticate again to refresh models.";
    return null;
  }, [loading, loadError, source]);

  const infoLineWithTime = React.useMemo(() => {
    if (!infoLine) return null;
    if (!formattedUpdatedAt || loading) return infoLine;
    return `${infoLine} Updated ${formattedUpdatedAt}.`;
  }, [infoLine, formattedUpdatedAt, loading]);

  const selectTitle = infoLineWithTime ? `${descriptiveHelp} — ${infoLineWithTime}` : descriptiveHelp;

  if (compact) {
    return (
      <select
        id="model"
        className="text-xs rounded border px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value as ModelId)}
        disabled={disabled || loading}
        title={selectTitle}
        aria-busy={loading}
      >
        {options.map(option => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
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
        disabled={disabled || loading}
        title={selectTitle}
        aria-busy={loading}
      >
        {options.map(option => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}{option.disabled ? " (unavailable)" : ""}
          </option>
        ))}
      </select>
      <div className="flex flex-col gap-1 text-xs text-gray-600">
        <div className="flex items-center gap-2 flex-wrap">
          <span>{descriptiveHelp}</span>
          {selectedMeta && (
            <>
              {selectedMeta.vision && <Badge>Vision</Badge>}
              {selectedMeta.reasoning && <Badge>Reasoning</Badge>}
              {selectedMeta.imageGen && <Badge>Image&nbsp;Gen</Badge>}
              <Badge>Qual {selectedMeta.quality}</Badge>
              <Badge>Cost {selectedMeta.cost}</Badge>
              <Badge>Speed {selectedMeta.speed}</Badge>
            </>
          )}
        </div>
        {infoLineWithTime && (
          <div className="text-[11px] text-gray-500">{infoLineWithTime}</div>
        )}
      </div>
      {value === "gpt-image-1" && (
        <div className="mt-1 rounded-md border px-2 py-1 text-xs">
          This model outputs images; the current pipeline expects text. Use GPT-4o/4o-mini for analysis responses.
        </div>
      )}
    </div>
  );
}
