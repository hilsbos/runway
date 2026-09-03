/**
 * Runway — shared UI primitives.
 *
 * Presentational, typed React components for the dark instrument-panel
 * aesthetic. These hold no model logic and import nothing from `src/model`.
 * Importing this barrel also pulls in the components' stylesheet (which builds
 * on the tokens in `src/ui/theme.css`).
 */
import "./components.css";

/* layout helpers */
export { Field, ControlRow } from "./Field.tsx";
export type { FieldProps, ControlRowProps } from "./Field.tsx";

/* sliders */
export { Slider, LogSlider } from "./Slider.tsx";
export type { SliderProps, SliderAccent } from "./Slider.tsx";

/* toggles */
export { Segmented } from "./Segmented.tsx";
export type { SegmentedProps, SegmentedOption } from "./Segmented.tsx";
export { Toggle } from "./Toggle.tsx";
export type { ToggleProps } from "./Toggle.tsx";

/* inputs */
export { NumberInput } from "./NumberInput.tsx";
export type { NumberInputProps } from "./NumberInput.tsx";

/* readouts */
export { StatCard } from "./StatCard.tsx";
export type { StatCardProps } from "./StatCard.tsx";
export { UtilBar, utilLevel } from "./UtilBar.tsx";
export type { UtilBarProps, UtilLevel } from "./UtilBar.tsx";
export { TierCard } from "./TierCard.tsx";
export type { TierCardProps, TierSpec } from "./TierCard.tsx";

/* banners */
export { Banner } from "./Banner.tsx";
export type { BannerProps, BannerVariant } from "./Banner.tsx";
