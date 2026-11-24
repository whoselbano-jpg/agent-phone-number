/**
 * Bland API / app host pairings.
 * Source: https://docs.bland.ai/llms.txt (Platform Information → regional hosts).
 */
export const REGIONS = Object.freeze({
  us: { api: "https://api.bland.ai", app: "https://app.bland.ai", label: "United States" },
  eu: { api: "https://eu.api.bland.ai", app: "https://eu.app.bland.ai", label: "European Union" },
  ca: { api: "https://ca.api.bland.ai", app: "https://ca.app.bland.ai", label: "Canada" },
  asia: { api: "https://asia.api.bland.ai", app: "https://asia.app.bland.ai", label: "Asia Pacific" },
  au: { api: "https://asia.api.bland.ai", app: "https://au.app.bland.ai", label: "Australia" },
});

export const DEFAULT_REGION = "us";

export function resolveRegion(name = process.env.BLAND_REGION || DEFAULT_REGION) {
  const key = String(name || DEFAULT_REGION).toLowerCase();
  const region = REGIONS[key];
  if (!region) {
    throw new Error(
      `Unknown Bland region "${name}". Valid regions: ${Object.keys(REGIONS).join(", ")}`,
    );
  }
  return { key, ...region };
}

/** The hosted Bland MCP endpoint. OAuth tokens only work here, not on general REST. */
export function mcpEndpoint(region = resolveRegion()) {
  return `${region.api}/v1/mcp`;
}
