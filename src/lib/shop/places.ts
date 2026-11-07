// Places a shop ships to and charges tax in: countries (ISO 3166-1 alpha-2) and US states, written as
// "US" or "US-NY"; "*" is everywhere else. Names come from the runtime's Intl data. Safe in the browser.

/** ISO 3166-1 alpha-2 codes. */
export const COUNTRY_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');

/** US states, DC and the territories with their own postal codes. */
export const US_STATES: [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
  ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['PR', 'Puerto Rico'], ['GU', 'Guam'],
  ['VI', 'US Virgin Islands'], ['AS', 'American Samoa'], ['MP', 'Northern Mariana Islands'],
  ['AA', 'Armed Forces Americas'], ['AE', 'Armed Forces Europe'], ['AP', 'Armed Forces Pacific'],
];
const STATE_CODES = new Set(US_STATES.map(([c]) => c));
const COUNTRIES = new Set(COUNTRY_CODES);

/** Everywhere not named by another place. */
export const ELSEWHERE = '*';

/** A place code, cleaned: "US", "US-NY" or "*"; null when it isn't one. */
export function cleanPlace(raw: unknown): string | null {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === ELSEWHERE) return v;
  const [country, state, more] = v.split('-');
  if (more !== undefined || !COUNTRIES.has(country)) return null;
  if (state === undefined) return country;
  return country === 'US' && STATE_CODES.has(state) ? `${country}-${state}` : null;
}

/** Where an order goes: a country code and, in the US, a state code. */
export interface Destination {
  country: string;
  state?: string;
}

/** Whether a place covers a destination: "*" everything, "US" the whole country, "US-NY" one state. */
export function covers(place: string, d: Destination): boolean {
  if (place === ELSEWHERE) return true;
  const [country, state] = place.split('-');
  if (country !== d.country.toUpperCase()) return false;
  return !state || state === (d.state ?? '').toUpperCase();
}

/** How specific a place is (a state over its country over everywhere), for the closest match. */
export const specificity = (place: string) => (place === ELSEWHERE ? 0 : place.includes('-') ? 2 : 1);

let names: Intl.DisplayNames | null | undefined;
/** A place's name: "New York (US)", "Canada", "Everywhere else". */
export function placeName(place: string): string {
  if (place === ELSEWHERE) return 'Everywhere else';
  const [country, state] = place.split('-');
  if (state) return `${US_STATES.find(([c]) => c === state)?.[1] ?? state} (US)`;
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      names = null;
    }
  }
  return names?.of(country) ?? country;
}

/** Countries for a picker, by name. */
export const countryChoices = (): [string, string][] => COUNTRY_CODES.map((c): [string, string] => [c, placeName(c)]).sort((a, b) => a[1].localeCompare(b[1]));
