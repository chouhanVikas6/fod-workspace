export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskThreshold {
  min: number;
  max: number;
}


export const DEFAULT_RISK_THRESHOLD: RiskThreshold = {
  min: 30,
  max: 90,
};


export const RISK_CONFIG: Record<string, RiskThreshold> = {
  Metallic: { min: 1, max: 2 },
  "Rocks/Asphalt": { min: 10, max: 35 },
  "Non-Metallic": { min: 15, max: 50 },
  Organic: { min: 50, max: 60 },
};

const CLASS_ALIASES: Record<string, string> = {
  "rocks/ashpalt": "Rocks/Asphalt",
};

const NORMALIZED_RISK_CONFIG: Record<string, RiskThreshold> = Object.entries(
  RISK_CONFIG
).reduce<Record<string, RiskThreshold>>((acc, [key, value]) => {
  acc[key.trim().toLowerCase()] = value;
  return acc;
}, {});

export function getRiskThresholds(
  fodClass?: string | null
): RiskThreshold {
  if (!fodClass || typeof fodClass !== "string") {
    return DEFAULT_RISK_THRESHOLD;
  }

  const normalized = fodClass.trim().toLowerCase();
  const aliasTarget = CLASS_ALIASES[normalized];
  const lookupKey = aliasTarget ? aliasTarget.toLowerCase() : normalized;

  return NORMALIZED_RISK_CONFIG[lookupKey] ?? DEFAULT_RISK_THRESHOLD;
}

export function calculateFodRisk(
  fodClass: string | undefined | null,
  size: number | string | undefined | null
): RiskLevel {
  const numericSize = Number(size);
  if (!Number.isFinite(numericSize)) {
    return "LOW";
  }

  const { min, max } = getRiskThresholds(fodClass);

  if (numericSize > max) {
    return "HIGH";
  }
  if (numericSize >= min) {
    return "MEDIUM";
  }
  return "LOW";
}

export const RISK_RANK: Record<RiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function getFodRiskRank(
  fodClass: string | undefined | null,
  size: number | string | undefined | null
): number {
  return RISK_RANK[calculateFodRisk(fodClass, size)];
}
