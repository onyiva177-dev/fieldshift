import { WELL_ABOVE, WELL_BELOW } from "@/lib/climate";

export type AlertLevel = "warning" | "info";
export interface Alert { level: AlertLevel; text: string; href?: string }

export interface AlertInput {
  farmId: string; farmName: string;
  soil: { verified: number; pending: number; needsCorrection: number; rejected: number; latestVerifiedOn: string | null };
  rainRecentPct: number | null; rainMonths: number;
  nasa: { hasData: boolean; lastStatus: string | null; lastDataset: string | null; lastMessage: string | null };
  crops: { current: string[]; recorded: number };
  today: Date;
}

/** Plain, rule-based alerts. Each one says what was found and where to act. Nothing is predicted. */
export function computeAlerts(i: AlertInput): Alert[] {
  const out: Alert[] = [];
  const f = i.farmName;
  const base = `/farms/${i.farmId}`;

  if (i.soil.needsCorrection > 0) out.push({ level: "warning", text: `${f}: ${i.soil.needsCorrection} soil test${i.soil.needsCorrection > 1 ? "s need" : " needs"} correction by the officer.`, href: base });
  if (i.soil.pending > 0) out.push({ level: "info", text: `${f}: ${i.soil.pending} soil test${i.soil.pending > 1 ? "s are" : " is"} waiting for verification.`, href: base });
  if (i.soil.verified === 0) {
    out.push({ level: "warning", text: `${f}: no verified soil test yet, so recommendations are less reliable.`, href: `${base}/recommendations` });
  } else if (i.soil.latestVerifiedOn) {
    const years = (i.today.getTime() - new Date(i.soil.latestVerifiedOn).getTime()) / (365.25 * 86400000);
    if (years >= 2) out.push({ level: "warning", text: `${f}: the latest verified soil test is ${Math.floor(years)} years old. Ask an officer to re-test.`, href: base });
  }

  if (i.rainRecentPct !== null) {
    const p = Math.round(i.rainRecentPct);
    if (i.rainRecentPct < WELL_BELOW) out.push({ level: "warning", text: `${f}: rainfall over the last ${i.rainMonths} months was about ${p}% of normal (satellite estimate). Dry conditions may affect crops.`, href: `${base}/environment` });
    else if (i.rainRecentPct > WELL_ABOVE) out.push({ level: "info", text: `${f}: rainfall over the last ${i.rainMonths} months was about ${p}% of normal (satellite estimate). Watch for waterlogging and crop disease.`, href: `${base}/environment` });
  }

  if (i.nasa.lastStatus === "failed") out.push({ level: "warning", text: `${f}: the latest NASA ${i.nasa.lastDataset ?? ""} update failed${i.nasa.lastMessage ? `: ${i.nasa.lastMessage}` : ""}.`.replace("  ", " "), href: `${base}/environment` });
  else if (!i.nasa.hasData) out.push({ level: "info", text: `${f}: NASA climate data has not loaded yet. It is fetched in the background after a farm is registered.`, href: `${base}/environment` });

  if (i.crops.recorded === 0) out.push({ level: "info", text: `${f}: no crops recorded. Add the current and previous crops for better rotation advice.`, href: `${base}#crops` });

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "warning" ? -1 : 1));
}
