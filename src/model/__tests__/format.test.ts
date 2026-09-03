import { describe, it, expect } from "vitest";
import {
  compact,
  money,
  moneyExact,
  percent,
  deltaPercent,
  ms,
  duration,
  monthLabel,
  monthLong,
} from "../format.ts";

describe("compact", () => {
  it("formats magnitudes with K/M/B/T", () => {
    expect(compact(950)).toBe("950");
    expect(compact(1500)).toBe("1.5K");
    expect(compact(2_500_000)).toBe("2.5M");
    expect(compact(2_500_000_000)).toBe("2.5B");
    expect(compact(1e12)).toBe("1T");
  });
  it("handles sign and non-finite", () => {
    expect(compact(-1500)).toBe("-1.5K");
    expect(compact(NaN)).toBe("NaN");
  });
});

describe("money", () => {
  it("formats small amounts with separators", () => {
    expect(money(1600)).toBe("$1,600");
    expect(money(600)).toBe("$600");
  });
  it("compacts large amounts", () => {
    expect(money(19717)).toBe("$19.7K");
    expect(money(1_250_000)).toBe("$1.25M");
  });
  it("can disable compaction", () => {
    expect(money(19717, { compact: false })).toBe("$19,717");
  });
});

describe("moneyExact", () => {
  it("keeps two fraction digits", () => {
    expect(moneyExact(209.6)).toBe("$209.60");
  });
});

describe("percent", () => {
  it("formats ratios", () => {
    expect(percent(0.734)).toBe("73%");
    expect(percent(0.9)).toBe("90%");
    expect(percent(0.734, 1)).toBe("73.4%");
  });
  it("signs deltas", () => {
    expect(deltaPercent(-0.3)).toBe("-30%");
    expect(deltaPercent(0.12)).toBe("+12%");
  });
});

describe("ms", () => {
  it("scales precision by magnitude", () => {
    expect(ms(7.1)).toBe("7.1 ms");
    expect(ms(239.9)).toBe("240 ms");
    expect(ms(0.42)).toBe("0.42 ms");
  });
});

describe("duration", () => {
  it("formats seconds compactly", () => {
    expect(duration(3)).toBe("3s");
    expect(duration(90)).toBe("1m 30s");
    expect(duration(3600)).toBe("1h");
    expect(duration(5400)).toBe("1h 30m");
  });
});

describe("month labels", () => {
  it("formats short and long", () => {
    expect(monthLabel(0)).toBe("M0");
    expect(monthLabel(14)).toBe("M14");
    expect(monthLong(0)).toBe("now");
    expect(monthLong(14)).toBe("month 14");
    expect(monthLong(24)).toBe("year 2");
  });
});
