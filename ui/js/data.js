/* ═══════════════════════════════════════════════════════════════
   data.js — static data constants (roadmap, events, groups)
   Lorevox v6.1
   Load order: SECOND (after state.js)
═══════════════════════════════════════════════════════════════ */

/* ── Backend plan section ID → UI roadmap ID mapping ── */
const PLAN_ID_MAP = {
  personal_information:  "identity",
  family_and_heritage:   "origins",
  early_years:           "early_home",
  adolescence:           "teen",
  young_adulthood:       "first_job",
  marriage_and_family:   "marriage",
  career_and_achievements:"career",
  later_years:           "lessons",
  hobbies_and_events:    "hobbies",
  health_and_wellness:   "challenges",
  technology_and_beliefs:"technology",
  additional_notes:      "legacy",
  pets:                  "pets",
};

/* ── 37-Section Interview Roadmap ── */
const INTERVIEW_ROADMAP = [
  {id:"identity",    label:"Identity & Name",         emoji:"🪪", tags:["personal"]},
  {id:"origins",     label:"Family Origins",           emoji:"🌍", tags:["family","heritage"]},
  {id:"early_home",  label:"Early Home Life",          emoji:"🏠", tags:["childhood","environment"]},
  {id:"childhood",   label:"Childhood Memories",       emoji:"🧸", tags:["childhood","memories"]},
  {id:"pets",        label:"Pets & Animals",           emoji:"🐾", tags:["childhood","family"]},
  {id:"school",      label:"School Years",             emoji:"📚", tags:["education","friends"]},
  {id:"teen",        label:"Teenage Years",            emoji:"🎸", tags:["teen","identity","music","cars"]},
  {id:"first_job",   label:"First Job",                emoji:"💼", tags:["work","independence"]},
  {id:"cars",        label:"Cars & Transportation",    emoji:"🚗", tags:["cars","technology","travel"]},
  {id:"technology",  label:"Technology Changes",       emoji:"📺", tags:["technology","culture"]},
  {id:"world_events",label:"Historical Events",        emoji:"🌐", tags:["war","politics","economics"]},
  {id:"military",    label:"Military Service",         emoji:"🎖", tags:["military","war"]},
  {id:"education",   label:"Higher Education",         emoji:"🎓", tags:["education","career"]},
  {id:"career",      label:"Career & Work",            emoji:"🏢", tags:["work","career"]},
  {id:"marriage",    label:"Marriage & Partnerships",  emoji:"💍", tags:["family","love"]},
  {id:"children",    label:"Children & Parenting",     emoji:"👨‍👩‍👧", tags:["family","parenting"]},
  {id:"homes",       label:"Homes & Moves",            emoji:"📦", tags:["life","geography"]},
  {id:"hobbies",     label:"Hobbies & Interests",      emoji:"🎨", tags:["leisure","identity"]},
  {id:"travel",      label:"Travel",                   emoji:"✈️", tags:["travel","culture"]},
  {id:"faith",       label:"Faith & Values",           emoji:"🕊", tags:["faith","identity"]},
  {id:"community",   label:"Community Life",           emoji:"🤝", tags:["community","service"]},
  {id:"challenges",  label:"Major Challenges",         emoji:"⛰", tags:["resilience","health"]},
  {id:"proud",       label:"Proud Moments",            emoji:"🏆", tags:["achievement"]},
  {id:"lessons",     label:"Life Lessons",             emoji:"📖", tags:["wisdom","legacy"]},
  {id:"legacy",      label:"Legacy",                   emoji:"✨", tags:["legacy","memoir"]},
  // Extended life-event sections (always shown)
  {id:"identity_belonging", label:"Identity & Belonging",  emoji:"🌈", tags:["identity","community"]},
  {id:"grief_rebuilding",   label:"Grief & Rebuilding",    emoji:"🌿", tags:["resilience","health","family"]},
  {id:"caregiving",         label:"Caregiving",            emoji:"🤲", tags:["family","health","community"]},
  {id:"migration",          label:"Migration & Resettlement", emoji:"🌏", tags:["heritage","community","life"]},
  {id:"blended_family",     label:"Blended Family Life",   emoji:"🏠", tags:["family","identity"]},
  // Youth / digital-native sections (toggled by youthMode)
  {id:"friends_social", label:"Friends & Social Life",     emoji:"👯", tags:["teen","identity","community"],  youth:true},
  {id:"school_life",    label:"School Life",               emoji:"🏫", tags:["education","friends"],           youth:true},
  {id:"online_life",    label:"Online & Digital Life",     emoji:"📱", tags:["technology","culture","identity"],youth:true},
  {id:"music_identity", label:"Music & Identity",          emoji:"🎵", tags:["music","teen","identity"],       youth:true},
  {id:"big_changes",    label:"Big Changes",               emoji:"🔄", tags:["resilience","identity","life"],  youth:true},
  {id:"hopes_future",   label:"Hopes & Future",            emoji:"🌅", tags:["legacy","identity"],             youth:true},
];

// Sync sectionDone / sectionVisited array size with actual roadmap length
sectionDone    = new Array(INTERVIEW_ROADMAP.length).fill(false);
sectionVisited = new Array(INTERVIEW_ROADMAP.length).fill(false);

/* ── World Events ── */
const WORLD_EVENTS = [
  {year:1929,event:"Great Depression begins",                                    tags:["economics","us","global"]},
  {year:1939,event:"World War II begins in Europe",                              tags:["war","global","uk","australia","canada"]},
  {year:1941,event:"United States enters World War II",                          tags:["war","us"]},
  {year:1945,event:"World War II ends",                                          tags:["war","global","us","uk","canada","australia"]},
  {year:1950,event:"Korean War begins",                                          tags:["war","us"]},
  {year:1953,event:"Korean War ends",                                            tags:["war","us"]},
  {year:1955,event:"Television becomes common in American homes",               tags:["technology","culture","us"]},
  {year:1957,event:"USSR launches Sputnik — Space Race begins",                 tags:["technology","politics","global"]},
  {year:1960,event:"John F. Kennedy elected US president",                       tags:["politics","us"]},
  {year:1963,event:"President Kennedy assassinated in Dallas",                   tags:["politics","us","global"]},
  {year:1964,event:"The Beatles arrive in America; Ford Mustang debuts",         tags:["culture","music","cars","us"]},
  {year:1965,event:"Vietnam War escalates with US ground troops",               tags:["war","us"]},
  {year:1966,event:"Seat belts required in all new US cars",                    tags:["cars","us"]},
  {year:1967,event:"Summer of Love in San Francisco",                           tags:["culture","music","us"]},
  {year:1968,event:"MLK Jr. and Robert F. Kennedy assassinated",                tags:["politics","culture","us"]},
  {year:1969,event:"Apollo 11 — humans walk on the moon",                       tags:["technology","us","global"]},
  {year:1970,event:"Beatles break up; first Earth Day",                         tags:["culture","music","us","global"]},
  {year:1972,event:"Nixon visits China; Watergate break-in",                    tags:["politics","us"]},
  {year:1973,event:"Oil crisis — gas rationing across the US",                  tags:["economics","us","cars"]},
  {year:1974,event:"Nixon resigns; streaking craze — 'The Streak' by Ray Stevens", tags:["politics","culture","music","us"]},
  {year:1975,event:"Vietnam War ends; Saigon falls",                            tags:["war","us"]},
  {year:1977,event:"Star Wars released; Elvis Presley dies",                    tags:["culture","music","us"]},
  {year:1979,event:"Iran hostage crisis; Three Mile Island accident",           tags:["politics","us"]},
  {year:1980,event:"John Lennon shot; Ronald Reagan elected president",         tags:["politics","culture","music","us"]},
  {year:1981,event:"MTV launches; IBM PC released; AIDS epidemic identified",   tags:["technology","culture","music","us"]},
  {year:1982,event:"Compact disc (CD) goes on sale",                            tags:["technology","music","global"]},
  {year:1984,event:"Apple Macintosh introduced",                                tags:["technology","us"]},
  {year:1986,event:"Space Shuttle Challenger disaster; Chernobyl",             tags:["technology","us","global"]},
  {year:1989,event:"Fall of the Berlin Wall; Tiananmen Square",                tags:["politics","global","uk","europe"]},
  {year:1991,event:"Gulf War; Soviet Union dissolves",                          tags:["war","politics","global","us"]},
  {year:1993,event:"World Wide Web opens to the public",                        tags:["technology","global"]},
  {year:1995,event:"Oklahoma City bombing; Windows 95 released",               tags:["politics","technology","us"]},
  {year:1997,event:"Princess Diana dies; Hong Kong returned to China",          tags:["culture","global","uk"]},
  {year:1999,event:"Y2K fears; Columbine school shooting",                      tags:["technology","us"]},
  {year:2001,event:"September 11 attacks; Afghanistan War begins",             tags:["war","politics","us","global"]},
  {year:2003,event:"Iraq War begins; Facebook founded",                         tags:["war","technology","us"]},
  {year:2005,event:"Hurricane Katrina devastates New Orleans",                  tags:["us"]},
  {year:2007,event:"iPhone introduced; Great Recession begins",                tags:["technology","economics","us","global"]},
  {year:2008,event:"Barack Obama elected first Black US president",            tags:["politics","us"]},
  {year:2010,event:"iPad and Instagram launched",                               tags:["technology","global"]},
  {year:2016,event:"Donald Trump elected; Brexit vote in UK",                  tags:["politics","us","uk","global"]},
  {year:2020,event:"COVID-19 pandemic; George Floyd protests",                 tags:["health","politics","us","global"]},
  {year:2022,event:"Russia invades Ukraine",                                    tags:["war","global","uk","europe"]},
  {year:2023,event:"AI boom — ChatGPT goes mainstream",                        tags:["technology","global"]},
];

const EVERYDAY_EVENTS = [
  {year:1948,event:"Long-playing record (LP) introduced",                        tags:["music","technology","global"]},
  {year:1954,event:"Transistor radio becomes popular",                           tags:["technology","music","global"]},
  {year:1960,event:"Oral contraceptive pill approved in US",                     tags:["health","culture","us"]},
  {year:1964,event:"Surgeon General: smoking causes cancer",                     tags:["health","us"]},
  {year:1971,event:"Microwave oven becomes widely affordable",                   tags:["technology","us"]},
  {year:1975,event:"Home video (VHS/Betamax) introduced",                       tags:["technology","culture","us","global"]},
  {year:1978,event:"First 'test tube baby' born via IVF",                       tags:["health","technology","global"]},
  {year:1989,event:"Portable CD players go mainstream",                         tags:["technology","music","global"]},
  {year:1993,event:"Cell phones start going mainstream",                         tags:["technology","global"]},
  {year:1998,event:"Google founded",                                             tags:["technology","us","global"]},
  {year:2001,event:"iPod and iTunes introduced",                                tags:["technology","music","us","global"]},
  {year:2005,event:"YouTube launched",                                           tags:["technology","culture","global"]},
  {year:2007,event:"Netflix streaming begins; Kindle e-reader released",        tags:["technology","culture","global"]},
  {year:2016,event:"Self-driving car tests begin publicly",                      tags:["technology","cars","us"]},
];

// Family, food, faith, and local life events
const LIFE_EVENTS = [
  {year:1950,event:"Extended family Sunday dinners were the center of many households",   tags:["family_life","us","global"]},
  {year:1955,event:"Church and community faith life shaped weekly routines",               tags:["faith","us","global"]},
  {year:1960,event:"Neighborhood corner stores and local markets were social hubs",        tags:["local","global"]},
  {year:1965,event:"Family road trips became a summer tradition across America",           tags:["family_life","cars","us"]},
  {year:1970,event:"Home cooking and family recipes passed through generations",           tags:["food","family_life","global"]},
  {year:1975,event:"Church social halls hosted community dinners, dances, and bingo",      tags:["faith","community","local","us"]},
  {year:1980,event:"Local parish, mosque, synagogue, or temple as community anchor",       tags:["faith","community","global"]},
  {year:1985,event:"Quinceañeras, bar/bat mitzvahs, confirmations marked coming of age",  tags:["faith","family_life","global","mexico"]},
  {year:1990,event:"Family holiday traditions — food, music, and reunion rituals",         tags:["food","family_life","global"]},
  {year:1992,event:"Día de los Muertos becomes more broadly celebrated in US communities", tags:["faith","food","local","mexico","us"]},
  {year:1995,event:"Local farmers markets and community fairs gained new popularity",      tags:["food","local","us"]},
  {year:2000,event:"Immigrant families navigated blending home traditions with new culture",tags:["family_life","food","global","local"]},
  {year:2005,event:"Family recipe books and food blogs begin preserving culinary heritage", tags:["food","family_life","global"]},
  {year:2010,event:"Multi-generational households increased as families adapted",          tags:["family_life","global","us"]},
  {year:2015,event:"LGBTQ+ families and chosen family structures gain wider recognition",  tags:["family_life","local","us","global"]},
  {year:2018,event:"Community mutual aid networks grew in cities and neighborhoods",       tags:["local","community","us"]},
  {year:2020,event:"Pandemic changed how families celebrated, grieved, and gathered",      tags:["family_life","faith","food","global"]},
];

const ALL_EVENTS = [...WORLD_EVENTS, ...EVERYDAY_EVENTS, ...LIFE_EVENTS].sort((a,b)=>a.year-b.year);

/* ── Thematic interview groups ── */
const THEMATIC_GROUPS=[
  {label:"Early Life",       ids:["identity","origins","early_home","childhood","pets","school","teen","identity_belonging"]},
  {label:"Work & Learning",  ids:["first_job","education","career","technology","cars"]},
  {label:"Family & Relationships", ids:["marriage","children","homes","blended_family","caregiving"]},
  {label:"World & Community",ids:["world_events","military","community","travel","migration"]},
  {label:"Inner Life",       ids:["faith","hobbies","challenges","proud","lessons","legacy","grief_rebuilding"]},
  {label:"Youth & Digital",  ids:["friends_social","school_life","online_life","music_identity","big_changes","hopes_future"]},
];

/* ── Memoir thematic ordering ── */
const MEMOIR_THEMATIC_ORDER=[
  "identity","origins","early_home","childhood","pets","school","teen","identity_belonging",
  "first_job","education","career","technology","cars",
  "marriage","children","homes","blended_family","caregiving",
  "world_events","military","community","travel","migration",
  "faith","hobbies","challenges","grief_rebuilding","proud","lessons","legacy",
  "friends_social","school_life","online_life","music_identity","big_changes","hopes_future"
];
const MEMOIR_EARLY_LIFE=["identity","origins","early_home","childhood","pets","school","teen","friends_social","school_life","music_identity","big_changes","hopes_future"];
const MEMOIR_FAMILY_LEGACY=["origins","early_home","family","marriage","children","blended_family","caregiving","homes","community","faith","lessons","legacy"];
