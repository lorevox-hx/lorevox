/**
 * Phase 3 Stress Test — Source Ingestion Data
 * Biographical source texts for 5 narrators.
 *
 * Usage:
 *   1. Load narrator in UI
 *   2. Open Bio Builder → Source Inbox
 *   3. Run: PHASE3_TEST.getSource("trump")
 *   4. Paste the returned text into the source textarea
 *   5. Or use: PHASE3_TEST.injectSource("trump") to auto-paste
 */
(function () {
  "use strict";

  var SOURCES = {
    trump: 'Donald John Trump was born on June 14, 1946, at 10:54 AM at Jamaica Hospital in Queens, New York City. He was the fourth of five children born to Frederick Christ Trump, a real estate developer, and Mary Anne MacLeod Trump, a Scottish immigrant.\n\nHis paternal grandparents, Friedrich Trump and Elizabeth Christ Trump, were German immigrants. Friedrich made money during the Klondike Gold Rush operating hotels and restaurants. After his death, Elizabeth founded the company Elizabeth Trump & Son.\n\nTrump grew up with siblings Maryanne Trump Barry, Fred Trump Jr., Elizabeth Trump Grau, and Robert Trump. As a child, he often accompanied his father to construction sites, where he learned cost control practices such as collecting unused nails.\n\nHe attended the New York Military Academy, then Fordham University, and later transferred to the Wharton School of the University of Pennsylvania, graduating in 1968.\n\nHe entered the family real estate business and later developed major Manhattan properties such as Trump Tower and the Grand Hyatt Hotel. In the early 2000s, he became a media personality through the television show The Apprentice.\n\nHe was elected President of the United States in 2016 and again in 2024, becoming the 45th and 47th president. He resides at Mar-a-Lago in Florida.\n\nTrump is known for his interest in golf and has authored The Art of the Deal.',

    king: 'Billie Jean King was born November 22, 1943, in Long Beach, California, at 8:00 AM. She was the first child of Bill Moffitt, a firefighter, and Betty Moffitt, a homemaker and swimmer.\n\nHer grandparents included Willis Durkee Moffitt, Blanche Gertrude Leighton, Roscoe William Jerman, and Doris L. Edgar. Her younger brother Randy Moffitt became a Major League Baseball pitcher.\n\nAs a child, she saved $8.29 to buy her first tennis racket and trained on public courts in Long Beach. She attended California State University, Los Angeles.\n\nShe went on to win 39 Grand Slam titles and founded the Women\'s Tennis Association in 1973. She also founded the Women\'s Sports Foundation and World Team Tennis.\n\nIn 1973, she defeated Bobby Riggs in the "Battle of the Sexes," a major cultural moment in sports history.\n\nShe later became a global advocate for gender equality and LGBTQ+ rights. Her partner is Ilana Kloss.\n\nShe received the Presidential Medal of Freedom in 2009 and the Congressional Gold Medal in 2024.',

    baldwin: 'James Arthur Baldwin was born August 2, 1924, at Harlem Hospital in New York City. He was the eldest of nine children born to Emma Berdis Jones.\n\nHis stepfather, David Baldwin, was a Baptist preacher. Baldwin had a difficult relationship with him and later learned that David was not his biological father.\n\nHis paternal grandmother, Barbara, had been born into slavery, and this history influenced Baldwin\'s writing.\n\nHe spent much of his childhood reading at the 135th Street Public Library, where he was mentored by Herman W. Porter.\n\nBaldwin attended DeWitt Clinton High School and briefly worked as a preacher before pursuing writing full-time.\n\nHis major works include Go Tell It on the Mountain and The Fire Next Time. He became a leading voice in the Civil Rights Movement.\n\nHe later lived in France and traveled throughout Europe and Turkey. He died in 1987 in Saint-Paul-de-Vence, France.\n\nHe left behind an unfinished manuscript titled Remember This House.',

    disney: 'Walter Elias Disney was born December 5, 1901, in Chicago, Illinois, at 12:35 AM. He was the fourth of five children of Elias Disney and Flora Call Disney.\n\nHis grandfather, Kepple Disney, was an Irish immigrant. Walt grew up with siblings Herbert, Raymond, Roy, and Ruth.\n\nHis brother Roy Disney later became his business partner and managed financial operations of the Disney company.\n\nWalt spent part of his childhood in Marceline, Missouri, where he developed an interest in drawing and trains. He was paid 25 cents for drawing a neighbor\'s horse.\n\nHe served as a Red Cross ambulance driver during World War I.\n\nHe later founded Disney Studios, created Mickey Mouse in 1928, and produced Snow White and the Seven Dwarfs in 1937.\n\nHe opened Disneyland in 1955 and began work on EPCOT, a futuristic city concept.\n\nWalt Disney won 22 Academy Awards and a total of 26 Oscars. He died in 1966 of lung cancer.',

    smith: 'Margaret Natalie Smith was born December 28, 1934, in Ilford, Essex, England, at 9:15 PM. She was the youngest of three children of Nathaniel Smith, a public health pathologist, and Margaret Hutton Smith.\n\nHer grandparents included Henry Smith, Kate Gregory, William Hutton, and Martha Little. She had two older brothers, Alistair and Ian.\n\nHer family moved to Oxford when she was young. She attended Oxford High School for Girls and later trained at the Oxford Playhouse.\n\nShe made her stage debut in 1952 and went on to have a career spanning more than seven decades.\n\nShe won Academy Awards for The Prime of Miss Jean Brodie (1969) and California Suite (1978).\n\nLater in life, she became widely known for her roles in Harry Potter and Downton Abbey.\n\nShe was diagnosed with Graves\' disease and later breast cancer but continued acting during treatment.\n\nShe was awarded Dame Commander of the Order of the British Empire (DBE).\n\nShe died September 27, 2024, in London.'
  };

  function getSource(key) {
    return SOURCES[key] || "Unknown narrator: " + key;
  }

  window.PHASE3_TEST = {
    SOURCES: SOURCES,
    getSource: getSource
  };

  console.log("Phase 3 test harness loaded. Use: PHASE3_TEST.getSource('trump') etc.");
})();
