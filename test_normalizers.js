/**
 * Standalone test harness for bio-builder.js normalization helpers.
 * Extracts the functions and runs all persona inputs + edge cases.
 */

// ── Inline copies of the helpers (to test without DOM) ──────────

const US_STATES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",
  KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
  MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
  NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",
  NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",
  OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",
  SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",
  VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",
  WI:"Wisconsin",WY:"Wyoming",DC:"District of Columbia"
};

const _MONTH_NAMES = {
  jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
  may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,
  oct:10,october:10,nov:11,november:11,dec:12,december:12
};

function normalizeDobInput(raw) {
  if (!raw) return "";
  var s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m, mm, dd, yyyy;
  if (/^\d{8}$/.test(s)) {
    mm = parseInt(s.slice(0, 2), 10);
    dd = parseInt(s.slice(2, 4), 10);
    yyyy = parseInt(s.slice(4), 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1800 && yyyy <= 2100)
      return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
  }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    mm = parseInt(m[1], 10); dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
      return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (m) {
    var mon = _MONTH_NAMES[m[1].toLowerCase()];
    if (mon) {
      dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
      return yyyy + "-" + String(mon).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
    }
  }
  // MM DD YYYY (space-separated)
  m = s.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/);
  if (m) {
    mm = parseInt(m[1], 10); dd = parseInt(m[2], 10); yyyy = parseInt(m[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
      return yyyy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
  }
  return s;
}

function normalizeTimeOfBirthInput(raw) {
  if (!raw) return "";
  var s = raw.trim().toLowerCase().replace(/\s+/g, "");
  var m, h, min, ampm;
  m = s.match(/^(\d{3,4})(a|am|p|pm)$/);
  if (m) {
    var digits = m[1].padStart(4, "0");
    h = parseInt(digits.slice(0, 2), 10);
    min = parseInt(digits.slice(2), 10);
    ampm = m[2].charAt(0) === "a" ? "AM" : "PM";
    if (h >= 1 && h <= 12 && min >= 0 && min <= 59)
      return h + ":" + String(min).padStart(2, "0") + " " + ampm;
  }
  m = s.match(/^(\d{1,2}):(\d{2})\s*(a|am|p|pm)$/);
  if (m) {
    h = parseInt(m[1], 10); min = parseInt(m[2], 10);
    ampm = m[3].charAt(0) === "a" ? "AM" : "PM";
    if (h >= 1 && h <= 12 && min >= 0 && min <= 59)
      return h + ":" + String(min).padStart(2, "0") + " " + ampm;
  }
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    h = parseInt(m[1], 10); min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      ampm = h >= 12 ? "PM" : "AM";
      var h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
      return h12 + ":" + String(min).padStart(2, "0") + " " + ampm;
    }
  }
  // Bare 4-digit military/24h: 0915, 0600, 1430
  m = s.match(/^(\d{4})$/);
  if (m) {
    h = parseInt(s.slice(0, 2), 10); min = parseInt(s.slice(2), 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      ampm = h >= 12 ? "PM" : "AM";
      var h12b = h === 0 ? 12 : (h > 12 ? h - 12 : h);
      return h12b + ":" + String(min).padStart(2, "0") + " " + ampm;
    }
  }
  return raw.trim();
}

var _US_STATE_NAMES = {};
for (var _abbr in US_STATES) { _US_STATE_NAMES[US_STATES[_abbr].toLowerCase()] = US_STATES[_abbr]; }

function normalizePlaceInput(raw) {
  if (!raw) return "";
  var s = raw.trim();
  var m, full;
  m = s.match(/^(.+?),\s*([A-Z]{2})$/i);
  if (m) { full = US_STATES[m[2].toUpperCase()]; if (full) return m[1].trim() + ", " + full; }
  m = s.match(/^(.+?)\s+([A-Z]{2})$/i);
  if (m) { full = US_STATES[m[2].toUpperCase()]; if (full) return m[1].trim().replace(/,\s*$/, "") + ", " + full; }
  var words = s.split(/\s+/);
  for (var i = words.length - 1; i >= 1; i--) {
    var candidateState = words.slice(i).join(" ").toLowerCase();
    var fullState = _US_STATE_NAMES[candidateState];
    if (fullState) { return words.slice(0, i).join(" ").replace(/,\s*$/, "") + ", " + fullState; }
  }
  return s;
}

function deriveZodiacFromDob(isoDate) {
  if (!isoDate) return "";
  var parts = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return "";
  var mm = parseInt(parts[2], 10), dd = parseInt(parts[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  if ((mm===1 && dd<=19) || (mm===12 && dd>=22)) return "Capricorn";
  if ((mm===1 && dd>=20) || (mm===2 && dd<=18)) return "Aquarius";
  if ((mm===2 && dd>=19) || (mm===3 && dd<=20)) return "Pisces";
  if ((mm===3 && dd>=21) || (mm===4 && dd<=19)) return "Aries";
  if ((mm===4 && dd>=20) || (mm===5 && dd<=20)) return "Taurus";
  if ((mm===5 && dd>=21) || (mm===6 && dd<=20)) return "Gemini";
  if ((mm===6 && dd>=21) || (mm===7 && dd<=22)) return "Cancer";
  if ((mm===7 && dd>=23) || (mm===8 && dd<=22)) return "Leo";
  if ((mm===8 && dd>=23) || (mm===9 && dd<=22)) return "Virgo";
  if ((mm===9 && dd>=23) || (mm===10 && dd<=22)) return "Libra";
  if ((mm===10 && dd>=23) || (mm===11 && dd<=21)) return "Scorpio";
  if ((mm===11 && dd>=22) || (mm===12 && dd<=21)) return "Sagittarius";
  return "";
}

// ── TEST RUNNER ──────────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function assert(testName, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push({ testName, actual, expected });
    console.log(`  FAIL: ${testName}\n    expected: "${expected}"\n    actual:   "${actual}"`);
  }
}

// ════════════════════════════════════════════════════════════
// DOB NORMALIZATION
// ════════════════════════════════════════════════════════════
console.log("\n=== DOB Normalization ===");

// Persona inputs
assert("P1 Tom: 02141948",       normalizeDobInput("02141948"),       "1948-02-14");
assert("P2 Maggie: 07/03/1952",  normalizeDobInput("07/03/1952"),    "1952-07-03");
assert("P3 Daniel: 1961-09-18",  normalizeDobInput("1961-09-18"),    "1961-09-18");
assert("P4 Sharon: 11081958",    normalizeDobInput("11081958"),      "1958-11-08");
assert("P5 Avery: 03 22 1989",   normalizeDobInput("03 22 1989"),    "1989-03-22");
assert("P6 Becca: 04111963",     normalizeDobInput("04111963"),      "1963-04-11");
assert("P7 Mike: 12-01-1955",    normalizeDobInput("12-01-1955"),    "1955-12-01");
assert("P8 Jordan: 1949-06-29",  normalizeDobInput("1949-06-29"),    "1949-06-29");
assert("P9 Frank: 01091947",     normalizeDobInput("01091947"),      "1947-01-09");

// Extra formats
assert("Dec 24 1962",            normalizeDobInput("Dec 24 1962"),   "1962-12-24");
assert("December 24, 1962",      normalizeDobInput("December 24, 1962"), "1962-12-24");
assert("Mar 3 2000",             normalizeDobInput("Mar 3 2000"),    "2000-03-03");
assert("empty string",           normalizeDobInput(""),              "");
assert("null",                   normalizeDobInput(null),            "");

// ════════════════════════════════════════════════════════════
// TIME NORMALIZATION
// ════════════════════════════════════════════════════════════
console.log("\n=== Time Normalization ===");

assert("P1 Tom: 645a",           normalizeTimeOfBirthInput("645a"),       "6:45 AM");
assert("P2 Maggie: 11:20 pm",    normalizeTimeOfBirthInput("11:20 pm"),   "11:20 PM");
assert("P3 Daniel: 0915 (bare)", normalizeTimeOfBirthInput("0915"),       "9:15 AM");
assert("P4 Sharon: 5:40a",       normalizeTimeOfBirthInput("5:40a"),      "5:40 AM");
assert("P5 Avery: 1250p",        normalizeTimeOfBirthInput("1250p"),      "12:50 PM");
assert("P6 Becca: 7:05 PM",      normalizeTimeOfBirthInput("7:05 PM"),    "7:05 PM");
assert("P7 Mike: 10:10a",        normalizeTimeOfBirthInput("10:10a"),     "10:10 AM");
assert("P8 Jordan: 0600 (bare)", normalizeTimeOfBirthInput("0600"),       "6:00 AM");
assert("P9 Frank: nonsense",     normalizeTimeOfBirthInput("idk maybe noonish"), "idk maybe noonish");

// 24-hour format
assert("14:30 → 2:30 PM",        normalizeTimeOfBirthInput("14:30"),      "2:30 PM");
assert("00:00 → 12:00 AM",       normalizeTimeOfBirthInput("00:00"),      "12:00 AM");
assert("empty",                   normalizeTimeOfBirthInput(""),           "");

// ════════════════════════════════════════════════════════════
// PLACE NORMALIZATION
// ════════════════════════════════════════════════════════════
console.log("\n=== Place Normalization ===");

assert("P1 Tom: Amarillo TX",     normalizePlaceInput("Amarillo TX"),       "Amarillo, Texas");
assert("P2 Maggie: St Paul MN",   normalizePlaceInput("St Paul MN"),       "St Paul, Minnesota");
assert("P4 Sharon: Boise Idaho",  normalizePlaceInput("Boise Idaho"),      "Boise, Idaho");
assert("P5 Avery: Portland OR",   normalizePlaceInput("Portland OR"),      "Portland, Oregon");
assert("P6 Becca: Mobile AL",     normalizePlaceInput("Mobile AL"),        "Mobile, Alabama");
assert("P7 Mike: Cleveland OH",   normalizePlaceInput("Cleveland OH"),     "Cleveland, Ohio");
assert("P8 Jordan: Burlington VT", normalizePlaceInput("Burlington VT"),   "Burlington, Vermont");
assert("P9 Frank: Cheyenne WY",   normalizePlaceInput("Cheyenne WY"),     "Cheyenne, Wyoming");
assert("P3 Daniel: Santa Fe NM",  normalizePlaceInput("Santa Fe NM"),     "Santa Fe, New Mexico");

// Comma-separated
assert("Williston, ND",           normalizePlaceInput("Williston, ND"),    "Williston, North Dakota");
assert("New York, NY",            normalizePlaceInput("New York, NY"),     "New York, New York");

// Full state name
assert("Boise, Idaho comma",      normalizePlaceInput("Boise, Idaho"),     "Boise, Idaho");
assert("Santa Fe New Mexico",     normalizePlaceInput("Santa Fe New Mexico"), "Santa Fe, New Mexico");

// Non-US passthrough
assert("London, England",         normalizePlaceInput("London, England"),  "London, England");
assert("empty",                   normalizePlaceInput(""),                 "");

// ════════════════════════════════════════════════════════════
// ZODIAC DERIVATION
// ════════════════════════════════════════════════════════════
console.log("\n=== Zodiac Derivation ===");

assert("P1 Tom 02-14 → Aquarius",   deriveZodiacFromDob("1948-02-14"), "Aquarius");
assert("P2 Maggie 07-03 → Cancer",  deriveZodiacFromDob("1952-07-03"), "Cancer");
assert("P3 Daniel 09-18 → Virgo",   deriveZodiacFromDob("1961-09-18"), "Virgo");
assert("P4 Sharon 11-08 → Scorpio", deriveZodiacFromDob("1958-11-08"), "Scorpio");
assert("P6 Becca 04-11 → Aries",    deriveZodiacFromDob("1963-04-11"), "Aries");
assert("P7 Mike 12-01 → Sagittarius", deriveZodiacFromDob("1955-12-01"), "Sagittarius");
assert("P8 Jordan 06-29 → Cancer",  deriveZodiacFromDob("1949-06-29"), "Cancer");
assert("P9 Frank 01-09 → Capricorn", deriveZodiacFromDob("1947-01-09"), "Capricorn");
assert("Dec 24 → Capricorn",        deriveZodiacFromDob("1962-12-24"), "Capricorn");
assert("Dec 21 → Sagittarius",      deriveZodiacFromDob("1990-12-21"), "Sagittarius");
assert("Dec 22 → Capricorn",        deriveZodiacFromDob("1990-12-22"), "Capricorn");
assert("Jan 19 → Capricorn",        deriveZodiacFromDob("1990-01-19"), "Capricorn");
assert("Jan 20 → Aquarius",         deriveZodiacFromDob("1990-01-20"), "Aquarius");
assert("empty",                      deriveZodiacFromDob(""),           "");
assert("invalid",                    deriveZodiacFromDob("not-a-date"), "");

// ════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.log(`  - ${f.testName}: expected "${f.expected}", got "${f.actual}"`));
}
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
