export interface Region {
  code: string; // unique across countries, e.g. "US-CA", "CA-ON", "AU-NSW", "GB-ENG"
  name: string;
  country: "US" | "CA" | "AU" | "GB";
}

const US: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"],
  ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["PR", "Puerto Rico"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];
const CA: [string, string][] = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"],
  ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"],
];
const AU: [string, string][] = [
  ["NSW", "New South Wales"], ["VIC", "Victoria"], ["QLD", "Queensland"], ["WA", "Western Australia"],
  ["SA", "South Australia"], ["TAS", "Tasmania"], ["ACT", "Australian Capital Territory"], ["NT", "Northern Territory"],
];
const GB: [string, string][] = [
  ["ENG", "England"], ["SCT", "Scotland"], ["WLS", "Wales"], ["NIR", "Northern Ireland"],
];

export const COUNTRY_NAMES: Record<Region["country"], string> = {
  US: "United States",
  CA: "Canada",
  AU: "Australia",
  GB: "United Kingdom",
};

export const REGIONS: Region[] = [
  ...US.map(([c, n]) => ({ code: `US-${c}`, name: n, country: "US" as const })),
  ...CA.map(([c, n]) => ({ code: `CA-${c}`, name: n, country: "CA" as const })),
  ...AU.map(([c, n]) => ({ code: `AU-${c}`, name: n, country: "AU" as const })),
  ...GB.map(([c, n]) => ({ code: `GB-${c}`, name: n, country: "GB" as const })),
];

export const REGION_BY_CODE: Record<string, Region> = Object.fromEntries(REGIONS.map((r) => [r.code, r]));

/** Short display label, e.g. "CA" for US-CA, "ON" for CA-ON. */
export function regionShort(code: string): string {
  return code.includes("-") ? code.split("-")[1] : code;
}

export const TIMEZONES: string[] = (() => {
  try {
    // Modern browsers expose the full IANA list.
    const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    const list = anyIntl.supportedValuesOf?.("timeZone");
    if (list && list.length > 50) return list;
  } catch {
    /* fall through */
  }
  return [
    "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Phoenix",
    "America/Chicago", "America/New_York", "America/Puerto_Rico", "America/Toronto", "America/Vancouver",
    "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns", "Europe/London",
    "Europe/Dublin", "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth",
    "Australia/Adelaide", "Australia/Darwin", "Australia/Hobart", "UTC",
  ];
})();

export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}
