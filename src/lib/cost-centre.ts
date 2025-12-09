// src/lib/cost-centre.ts
// Build your 5-character Cost Centre code from a UK postcode.
// Format: "E" + [Region N/S/E/W/G] + [first 3 chars of outward postcode]

type Region = "N" | "S" | "E" | "W" | "G";

// --- 1) DEFINE YOUR REGION GROUPS BASED ON YOUR LISTS ---

const NORTH_PREFIXES = new Set<string>([
  // Scotland (North & Central)
  "AB", "DD", "DG", "EH", "FK", "G", "HS", "IV", "KA", "KW", "KY", "ML", "PA", "PH", "TD", "ZE",
  // Northern England
  "BB", "BD", "BL", "CA", "CH", "DH", "DL", "DN", "FY", "HD", "HG", "HU", "HX", "LA",
  "L", "LS", "M", "NE", "OL", "PR", "S", "SK", "SR", "TS", "WA", "WN", "YO",
  // Northern Ireland
  "BT",
]);

const SOUTH_PREFIXES = new Set<string>([
  // South East England
  "BN", "BR", "CM", "CR", "CT", "DA", "E", "EC", "EN", "GU", "HA", "IG", "KT", "ME",
  "N", "NW", "RM", "SE", "SM", "SW", "TN", "TW", "UB", "W", "WC",
  // South West England
  "BA", "BH", "BS", "DT", "EX", "GL", "PL", "SN", "SO", "SP", "TA", "TQ", "TR",
  // South & Central Midlands
  "B", "CV", "DE", "DY", "HP", "HR", "LE", "MK", "NG", "NN", "OX", "RG", "SG", "SL", "ST", "WR", "WS", "WV",
]);

const EAST_PREFIXES = new Set<string>([
  "CB", "CM", "CO", "EN", "IP", "LU", "NR", "PE", "SG",
]);

const WEST_PREFIXES = new Set<string>([
  // Wales
  "CF", "LD", "LL", "NP", "SA", "SY",
  // Western England
  "BS", "CH", "GL", "HR", "TA",
  // Western Scotland
  "DG", "G", "KA", "PA",
]);

// --- 2) SMALL HELPERS TO WORK WITH POSTCODES ---

// Get outward part of postcode: e.g. "CM8" from "CM8 6ED"
function getOutwardPart(postcode: string): string {
  const clean = postcode.toUpperCase().trim();
  const parts = clean.split(/\s+/);
  return parts[0] || "";
}

// Decide N / S / E / W / G from outward part
function lookupRegion(outward: string): Region {
  if (!outward) return "G";

  // Take only the letters from the start, e.g. "CM" from "CM8"
  const letters = outward.replace(/[^A-Z]/g, "");
  const two = letters.slice(0, 2); // e.g. "CM"
  const one = letters.slice(0, 1); // e.g. "C"

  // Priority: EAST → WEST → SOUTH → NORTH → default G

  if (two && EAST_PREFIXES.has(two)) return "E";
  if (one && EAST_PREFIXES.has(one)) return "E";

  if (two && WEST_PREFIXES.has(two)) return "W";
  if (one && WEST_PREFIXES.has(one)) return "W";

  if (two && SOUTH_PREFIXES.has(two)) return "S";
  if (one && SOUTH_PREFIXES.has(one)) return "S";

  if (two && NORTH_PREFIXES.has(two)) return "N";
  if (one && NORTH_PREFIXES.has(one)) return "N";

  // If postcode not available / not in any list → "G"
  return "G";
}

// --- 3) MAIN FUNCTION: THIS IS WHAT OTHER CODE WILL CALL ---

export function buildCostCentreFromPostcode(postcode: string): string | null {
  if (!postcode) return null;

  const outward = getOutwardPart(postcode);    // e.g. "CO6"
  if (!outward) return null;

  const region = lookupRegion(outward);        // "N" | "S" | "E" | "W" | "G"

  // First 3 chars of outward, e.g. "CO6" from "CO6"
  const district = (outward.slice(0, 3) || "XXX").padEnd(3, "X");

  // Final format: E + region + district    e.g. "EECO6"
  return `E${region}${district}`;
}
