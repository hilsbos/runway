/**
 * Runway — growth-curve controls (start load, model, rate/yr, horizon).
 * Shared between the single-design and comparison views.
 */
import { Field, Segmented, Slider } from "../components/index.ts";
import type { SegmentedOption } from "../components/index.ts";
import type { GrowthInputs, GrowthModel } from "../../model/index.ts";
import { compact, percent, formatMonths } from "../../model/index.ts";

const MODELS: SegmentedOption<GrowthModel>[] = [
  { value: "linear", label: "Linear" },
  { value: "exponential", label: "Exponential" },
];

export interface GrowthControlsProps {
  growth: GrowthInputs;
  onChange: (next: GrowthInputs) => void;
  /** Show the starting-load slider (hidden when driven by the rps dial). */
  showStart?: boolean;
}

export function GrowthControls({
  growth,
  onChange,
  showStart = true,
}: GrowthControlsProps) {
  const set = <K extends keyof GrowthInputs>(key: K, value: GrowthInputs[K]) =>
    onChange({ ...growth, [key]: value });

  return (
    <div className="growth">
      {showStart && (
        <Slider
          label="Starting load"
          value={growth.startRps}
          min={1000}
          max={2_000_000}
          log
          accent="cyan"
          unit="rps"
          format={(v) => compact(v)}
          onChange={(v) => set("startRps", Math.round(v))}
        />
      )}
      <Field label="Growth model">
        <Segmented options={MODELS} value={growth.model} onChange={(v) => set("model", v)} block aria-label="Growth model" />
      </Field>
      <Slider
        label="Growth / year"
        value={growth.ratePerYear}
        min={0}
        max={3}
        step={0.05}
        accent="green"
        unit="/yr"
        format={(v) => percent(v)}
        onChange={(v) => set("ratePerYear", v)}
        hint={`+${percent(growth.ratePerYear)} year-over-year`}
      />
      <Slider
        label="Horizon"
        value={growth.horizonMonths}
        min={6}
        max={60}
        step={1}
        accent="amber"
        unit="mo"
        format={(v) => formatMonths(v)}
        onChange={(v) => set("horizonMonths", Math.round(v))}
      />
    </div>
  );
}
