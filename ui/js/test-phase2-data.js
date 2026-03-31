/**
 * Phase 2 Stress Test — Questionnaire Data Packs
 * Drop-in via console or <script> to populate questionnaire sections programmatically.
 *
 * Usage:
 *   1. Load narrator in UI
 *   2. Open Bio Builder
 *   3. Run: PHASE2_TEST.seedNarrator("trump")   (or "king", "baldwin", "disney", "smith")
 *   4. Switch narrators, come back, verify persistence
 */
(function () {
  "use strict";

  var DATA = {
    trump: {
      personal: {
        fullName: "Donald John Trump",
        preferredName: "Donald",
        birthOrder: "4th",
        dateOfBirth: "1946-06-14",
        timeOfBirth: "10:54 AM",
        placeOfBirth: "Jamaica Hospital, Queens, New York City, New York",
        zodiacSign: "Gemini"
      },
      parents: [
        {
          relation: "father",
          firstName: "Frederick",
          middleName: "Christ",
          lastName: "Trump",
          maidenName: "",
          birthDate: "",
          birthPlace: "",
          occupation: "Real estate developer",
          notableLifeEvents: "Built NYC housing empire",
          notes: ""
        },
        {
          relation: "mother",
          firstName: "Mary",
          middleName: "Anne",
          lastName: "MacLeod Trump",
          maidenName: "MacLeod",
          birthDate: "",
          birthPlace: "Scotland",
          occupation: "",
          notableLifeEvents: "Scottish immigrant",
          notes: ""
        }
      ],
      grandparents: [
        {
          firstName: "Friedrich",
          lastName: "Trump",
          ancestry: "German",
          culturalBackground: "German immigrant",
          memorableStories: "Klondike Gold Rush entrepreneur, operated hotels and restaurants"
        },
        {
          firstName: "Elizabeth",
          lastName: "Christ Trump",
          ancestry: "German",
          culturalBackground: "German immigrant",
          memorableStories: "Co-founded Elizabeth Trump & Son after Friedrich's death"
        }
      ],
      siblings: [
        { relation: "sister", firstName: "Maryanne", middleName: "Trump", lastName: "Barry", birthOrder: "", uniqueCharacteristics: "Federal judge", sharedExperiences: "", memories: "", notes: "" },
        { relation: "brother", firstName: "Fred", middleName: "", lastName: "Trump Jr.", birthOrder: "", uniqueCharacteristics: "Airline pilot", sharedExperiences: "", memories: "", notes: "" },
        { relation: "sister", firstName: "Elizabeth", middleName: "Trump", lastName: "Grau", birthOrder: "", uniqueCharacteristics: "Banking executive", sharedExperiences: "", memories: "", notes: "" },
        { relation: "brother", firstName: "Robert", middleName: "", lastName: "Trump", birthOrder: "", uniqueCharacteristics: "Real estate executive", sharedExperiences: "", memories: "", notes: "" }
      ],
      earlyMemories: {
        firstMemory: "Visited construction sites with father",
        favoriteToy: "",
        significantEvent: "Observed cost-control practices — collecting unused nails at job sites. Learned discipline and efficiency from father."
      },
      education: {
        schooling: "New York Military Academy",
        higherEducation: "Fordham University (2 years), then Wharton School, University of Pennsylvania (Economics)",
        earlyCareer: "Entered family real estate business (Trump Organization)",
        careerProgression: "Expansion into Manhattan luxury market. Media career (The Apprentice). 45th and 47th President of the United States.",
        communityInvolvement: "Political campaigns and public office",
        mentorship: "Fred Trump as early business influence"
      },
      laterYears: {
        retirement: "Residence at Mar-a-Lago, Florida. Continued political leadership post-presidency.",
        lifeLessons: "Non-consecutive presidency",
        adviceForFutureGenerations: ""
      },
      hobbies: {
        hobbies: "Golf, branding and media, writing and publishing",
        worldEvents: "Cold War, post-9/11 politics, COVID era",
        personalChallenges: "Public controversy, impeachment, legal and political battles",
        travel: "Domestic and international political/business travel"
      },
      additionalNotes: {
        unfinishedDreams: "",
        messagesForFutureGenerations: "Author of The Art of the Deal. Policy focus on 'America First'."
      }
    },

    king: {
      personal: {
        fullName: "Billie Jean Moffitt King",
        preferredName: "Billie Jean",
        birthOrder: "1st",
        dateOfBirth: "1943-11-22",
        timeOfBirth: "08:00 AM",
        placeOfBirth: "Long Beach, California",
        zodiacSign: "Scorpio"
      },
      parents: [
        {
          relation: "father",
          firstName: "Bill",
          middleName: "",
          lastName: "Moffitt",
          maidenName: "",
          birthDate: "",
          birthPlace: "",
          occupation: "Firefighter",
          notableLifeEvents: "",
          notes: ""
        },
        {
          relation: "mother",
          firstName: "Betty",
          middleName: "",
          lastName: "Moffitt",
          maidenName: "",
          birthDate: "",
          birthPlace: "",
          occupation: "Homemaker, swimmer",
          notableLifeEvents: "",
          notes: ""
        }
      ],
      grandparents: [
        { firstName: "Willis", lastName: "Durkee Moffitt", ancestry: "", culturalBackground: "", memorableStories: "" },
        { firstName: "Blanche", lastName: "Gertrude Leighton", ancestry: "", culturalBackground: "", memorableStories: "" },
        { firstName: "Roscoe", lastName: "William Jerman", ancestry: "", culturalBackground: "", memorableStories: "" },
        { firstName: "Doris", lastName: "L. Edgar", ancestry: "", culturalBackground: "", memorableStories: "" }
      ],
      siblings: [
        { relation: "brother", firstName: "Randy", middleName: "", lastName: "Moffitt", birthOrder: "", uniqueCharacteristics: "Major League Baseball pitcher", sharedExperiences: "", memories: "", notes: "" }
      ],
      earlyMemories: {
        firstMemory: "Saved $8.29 to buy first tennis racket",
        favoriteToy: "First tennis racket",
        significantEvent: "Played on public courts in Long Beach. Transitioned from softball to tennis."
      },
      education: {
        schooling: "Long Beach-area schools",
        higherEducation: "California State University, Los Angeles",
        earlyCareer: "Amateur and early professional tennis",
        careerProgression: "39 Grand Slam titles (12 singles, 16 doubles, 11 mixed). Founder of Women's Tennis Association (1973). Founder of Women's Sports Foundation. Founder of World Team Tennis.",
        communityInvolvement: "Advocacy for gender equality and LGBTQ+ visibility",
        mentorship: ""
      },
      laterYears: {
        retirement: "Global advocate for gender equality. Public leadership in LGBTQ+ rights.",
        lifeLessons: "",
        adviceForFutureGenerations: ""
      },
      hobbies: {
        hobbies: "Tennis, social justice advocacy, sports leadership",
        worldEvents: "Title IX era, women's rights era, LGBTQ+ rights",
        personalChallenges: "Sexism in sports, public scrutiny",
        travel: "International tournament circuit"
      },
      additionalNotes: {
        unfinishedDreams: "",
        messagesForFutureGenerations: "Defeated Bobby Riggs in 1973 'Battle of the Sexes'. Recipient of Presidential Medal of Freedom (2009). Congressional Gold Medal (2024)."
      }
    },

    baldwin: {
      personal: {
        fullName: "James Arthur Baldwin",
        preferredName: "Jimmy",
        birthOrder: "1st",
        dateOfBirth: "1924-08-02",
        timeOfBirth: "10:00 PM",
        placeOfBirth: "Harlem Hospital, New York City, New York",
        zodiacSign: "Leo"
      },
      parents: [
        {
          relation: "mother",
          firstName: "Emma",
          middleName: "Berdis",
          lastName: "Jones",
          maidenName: "",
          birthDate: "",
          birthPlace: "",
          occupation: "",
          notableLifeEvents: "",
          notes: ""
        },
        {
          relation: "father",
          firstName: "David",
          middleName: "",
          lastName: "Baldwin",
          maidenName: "",
          birthDate: "",
          birthPlace: "",
          occupation: "Preacher",
          notableLifeEvents: "Stepfather — Baptist preacher. Difficult relationship with James.",
          notes: "Stepfather, not biological father"
        }
      ],
      grandparents: [
        {
          firstName: "Barbara",
          lastName: "",
          ancestry: "African American",
          culturalBackground: "Born into enslavement",
          memorableStories: "Her history of enslavement influenced Baldwin's writing"
        }
      ],
      siblings: [
        { relation: "brother", firstName: "George", middleName: "", lastName: "Baldwin", birthOrder: "2nd", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "sister", firstName: "Barbara", middleName: "", lastName: "Baldwin", birthOrder: "3rd", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "brother", firstName: "Wilmer", middleName: "", lastName: "Baldwin", birthOrder: "4th", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "brother", firstName: "David", middleName: "", lastName: "Baldwin Jr.", birthOrder: "5th", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "sister", firstName: "Gloria", middleName: "", lastName: "Baldwin", birthOrder: "6th", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "sister", firstName: "Ruth", middleName: "", lastName: "Baldwin", birthOrder: "7th", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "sister", firstName: "Elizabeth", middleName: "", lastName: "Baldwin", birthOrder: "8th", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "sister", firstName: "Paula", middleName: "", lastName: "Baldwin", birthOrder: "9th", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" }
      ],
      earlyMemories: {
        firstMemory: "Spent time reading at 135th Street Public Library",
        favoriteToy: "Books",
        significantEvent: "Mentored by Herman W. Porter at the library. Protected younger siblings in strict household. Experienced religious upbringing through stepfather."
      },
      education: {
        schooling: "DeWitt Clinton High School",
        higherEducation: "No formal degree path completed",
        earlyCareer: "Early role as preacher, then writing",
        careerProgression: "Novelist, essayist, playwright, social critic. Go Tell It on the Mountain (1953). The Fire Next Time (1963).",
        communityInvolvement: "Civil-rights writing and public speaking",
        mentorship: "Literary and activist circles"
      },
      laterYears: {
        retirement: "Lived as expatriate in France. Traveled across Europe and Turkey. Active in Civil Rights Movement.",
        lifeLessons: "",
        adviceForFutureGenerations: ""
      },
      hobbies: {
        hobbies: "Writing, reading, social and political philosophy",
        worldEvents: "Jim Crow era, civil rights movement, postwar Europe",
        personalChallenges: "Racism, poverty, exile, sexuality",
        travel: "Paris, France; Turkey; international lecture circuits"
      },
      additionalNotes: {
        unfinishedDreams: "Unfinished manuscript: Remember This House",
        messagesForFutureGenerations: "Died in 1987 in Saint-Paul-de-Vence, France."
      }
    },

    disney: {
      personal: {
        fullName: "Walter Elias Disney",
        preferredName: "Walt",
        birthOrder: "4th",
        dateOfBirth: "1901-12-05",
        timeOfBirth: "12:35 AM",
        placeOfBirth: "Chicago, Illinois",
        zodiacSign: "Sagittarius"
      },
      parents: [
        {
          relation: "father",
          firstName: "Elias",
          middleName: "",
          lastName: "Disney",
          maidenName: "",
          birthDate: "",
          birthPlace: "",
          occupation: "Farmer, contractor",
          notableLifeEvents: "",
          notes: ""
        },
        {
          relation: "mother",
          firstName: "Flora",
          middleName: "Call",
          lastName: "Disney",
          maidenName: "Call",
          birthDate: "",
          birthPlace: "",
          occupation: "Teacher",
          notableLifeEvents: "",
          notes: ""
        }
      ],
      grandparents: [
        {
          firstName: "Kepple",
          lastName: "Elias Disney",
          ancestry: "Irish",
          culturalBackground: "Irish immigrant",
          memorableStories: ""
        },
        {
          firstName: "Mary",
          lastName: "Richardson",
          ancestry: "",
          culturalBackground: "",
          memorableStories: ""
        }
      ],
      siblings: [
        { relation: "brother", firstName: "Herbert", middleName: "", lastName: "Disney", birthOrder: "1st", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "brother", firstName: "Raymond", middleName: "", lastName: "Disney", birthOrder: "2nd", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "brother", firstName: "Roy", middleName: "O.", lastName: "Disney", birthOrder: "3rd", uniqueCharacteristics: "Business partner, managed financial operations of the Disney company", sharedExperiences: "", memories: "", notes: "" },
        { relation: "sister", firstName: "Ruth", middleName: "", lastName: "Disney", birthOrder: "5th", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" }
      ],
      earlyMemories: {
        firstMemory: "Grew up in Marceline, Missouri. Drew cartoons and local subjects.",
        favoriteToy: "Drawing materials",
        significantEvent: "Developed fascination with trains. Drew a neighbor's horse for 25 cents."
      },
      education: {
        schooling: "Chicago-area schooling; art training",
        higherEducation: "No formal higher education",
        earlyCareer: "Commercial artist. Red Cross ambulance driver (WWI).",
        careerProgression: "Founder of Disney Studios. Created Mickey Mouse (1928). Produced Snow White (1937). Opened Disneyland (1955).",
        communityInvolvement: "Entertainment and cultural philanthropy",
        mentorship: "Roy O. Disney as business partner"
      },
      laterYears: {
        retirement: "Never retired. Developed EPCOT concept. Pioneered entertainment technology.",
        lifeLessons: "",
        adviceForFutureGenerations: ""
      },
      hobbies: {
        hobbies: "Animation, miniature steam trains, engineering and design",
        worldEvents: "Silent film era, Great Depression, WWII, postwar America",
        personalChallenges: "Studio strikes, war-era pressures, scale of expansion",
        travel: "Business and creative travel"
      },
      additionalNotes: {
        unfinishedDreams: "EPCOT-style futurist city concept",
        messagesForFutureGenerations: "22 Academy Awards (26 total). Died in 1966 (lung cancer)."
      }
    },

    smith: {
      personal: {
        fullName: "Margaret Natalie Smith",
        preferredName: "Maggie",
        birthOrder: "3rd",
        dateOfBirth: "1934-12-28",
        timeOfBirth: "09:15 PM",
        placeOfBirth: "Ilford, Essex, England",
        zodiacSign: "Capricorn"
      },
      parents: [
        {
          relation: "father",
          firstName: "Nathaniel",
          middleName: "",
          lastName: "Smith",
          maidenName: "",
          birthDate: "",
          birthPlace: "",
          occupation: "Public health pathologist",
          notableLifeEvents: "",
          notes: ""
        },
        {
          relation: "mother",
          firstName: "Margaret",
          middleName: "Hutton",
          lastName: "Smith",
          maidenName: "Hutton",
          birthDate: "",
          birthPlace: "",
          occupation: "Secretary",
          notableLifeEvents: "",
          notes: ""
        }
      ],
      grandparents: [
        { firstName: "Henry", lastName: "Smith", ancestry: "", culturalBackground: "", memorableStories: "" },
        { firstName: "Kate", lastName: "Gregory", ancestry: "", culturalBackground: "", memorableStories: "" },
        { firstName: "William", lastName: "Hutton", ancestry: "", culturalBackground: "", memorableStories: "" },
        { firstName: "Martha", lastName: "Little", ancestry: "", culturalBackground: "", memorableStories: "" }
      ],
      siblings: [
        { relation: "brother", firstName: "Alistair", middleName: "", lastName: "Smith", birthOrder: "1st", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" },
        { relation: "brother", firstName: "Ian", middleName: "", lastName: "Smith", birthOrder: "2nd", uniqueCharacteristics: "", sharedExperiences: "", memories: "", notes: "" }
      ],
      earlyMemories: {
        firstMemory: "Moved to Oxford at age four",
        favoriteToy: "Books and scripts",
        significantEvent: "Developed interest in acting early. Trained at Oxford Playhouse."
      },
      education: {
        schooling: "Oxford High School for Girls",
        higherEducation: "Oxford Playhouse School / theatrical training",
        earlyCareer: "Stage debut (1952)",
        careerProgression: "Career spanning more than seven decades. Academy Awards: The Prime of Miss Jean Brodie (1969), California Suite (1978). Major roles: Harry Potter (Professor McGonagall), Downton Abbey (Violet Crawley).",
        communityInvolvement: "Theatre and screen arts",
        mentorship: ""
      },
      laterYears: {
        retirement: "Continued acting through illness. Recovered from breast cancer. Active career until final years.",
        lifeLessons: "",
        adviceForFutureGenerations: ""
      },
      hobbies: {
        hobbies: "Theatre, film, performance arts",
        worldEvents: "WWII/postwar Britain, modern film and TV era",
        personalChallenges: "Long public career and aging in the spotlight. Diagnosed with Graves' disease and later breast cancer.",
        travel: "Stage and film travel"
      },
      additionalNotes: {
        unfinishedDreams: "",
        messagesForFutureGenerations: "Dame Commander of the British Empire (DBE). Died September 27, 2024, in London."
      }
    }
  };

  /**
   * Seed questionnaire for the active narrator using the given data key.
   * Writes directly into state.bioBuilder.questionnaire and persists.
   */
  function seedNarrator(key) {
    var d = DATA[key];
    if (!d) { console.error("Unknown narrator key:", key, "— use: trump, king, baldwin, disney, smith"); return; }

    var bb = (typeof state !== "undefined" && state.bioBuilder) ? state.bioBuilder : null;
    if (!bb) { console.error("state.bioBuilder not available"); return; }

    var qq = bb.questionnaire;
    if (!qq) { console.error("bb.questionnaire not available"); return; }

    // Flat sections
    var flatSections = ["personal", "earlyMemories", "education", "laterYears", "hobbies", "additionalNotes"];
    flatSections.forEach(function (secId) {
      if (d[secId]) {
        qq[secId] = Object.assign(qq[secId] || {}, d[secId]);
      }
    });

    // Repeatable sections
    var repeatSections = ["parents", "grandparents", "siblings"];
    repeatSections.forEach(function (secId) {
      if (d[secId] && Array.isArray(d[secId])) {
        qq[secId] = d[secId].slice();
      }
    });

    // Persist
    var pid = bb.personId;
    if (pid) {
      var lsKey = "lorevox_qq_draft_" + pid;
      localStorage.setItem(lsKey, JSON.stringify(qq));
      console.log("Seeded questionnaire for", key, "→ pid:", pid, "→ localStorage key:", lsKey);
    }

    // Refresh UI if Bio Builder is open
    if (typeof window.LorevoxBioBuilder !== "undefined" && window.LorevoxBioBuilder.refresh) {
      window.LorevoxBioBuilder.refresh();
    }

    return { sections: Object.keys(d), pid: pid };
  }

  /**
   * Verify questionnaire persistence after narrator switch.
   * Returns an object describing fill status per section.
   */
  function verifyPersistence(key) {
    var bb = (typeof state !== "undefined" && state.bioBuilder) ? state.bioBuilder : null;
    if (!bb) { return { error: "state.bioBuilder not available" }; }
    var qq = bb.questionnaire;
    var result = {};
    var sections = ["personal", "parents", "grandparents", "siblings", "earlyMemories", "education", "laterYears", "hobbies", "additionalNotes"];
    sections.forEach(function (s) {
      var val = qq[s];
      if (Array.isArray(val)) {
        result[s] = val.length + " entries";
      } else if (val && typeof val === "object") {
        var filled = Object.keys(val).filter(function (k) { return val[k] && val[k] !== ""; });
        result[s] = filled.length + "/" + Object.keys(val).length + " filled";
      } else {
        result[s] = "empty";
      }
    });
    result.pid = bb.personId;
    return result;
  }

  window.PHASE2_TEST = {
    DATA: DATA,
    seedNarrator: seedNarrator,
    verifyPersistence: verifyPersistence
  };

  console.log("Phase 2 test harness loaded. Use: PHASE2_TEST.seedNarrator('trump') etc.");
})();
