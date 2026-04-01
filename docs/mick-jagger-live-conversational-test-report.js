const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} = require("docx");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: "1B2A4A", type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })]
  });
}

function cell(text, width, fill) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 20 })] })]
  });
}

function passCell(pass, width) {
  const color = pass ? "2D7D2D" : "CC3333";
  const text = pass ? "PASS" : "FAIL";
  const fill = pass ? "E6F5E6" : "FDE8E8";
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color, font: "Arial", size: 20 })] })]
  });
}

function sectionHeading(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 }, children: [new TextRun({ text, font: "Arial" })] });
}

function bodyText(text) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, font: "Arial", size: 22 })] });
}

function boldBodyText(label, value) {
  return new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: label, bold: true, font: "Arial", size: 22 }),
    new TextRun({ text: value, font: "Arial", size: 22 })
  ]});
}

// Turn data
const turns = [
  { turn: 1, question: "What would you prefer to be called?", answer: "Michael Philip Jagger / Mick", loriText: true, ttsBefore: true, afterComplete: true, projUpdated: true, bbUpdated: true, nextCorrect: true, notes: "Identity gate: name captured as Mick. Full name missed." },
  { turn: 2, question: "Date of birth?", answer: "26 July 1943, Dartford, Kent", loriText: true, ttsBefore: true, afterComplete: true, projUpdated: true, bbUpdated: true, nextCorrect: true, notes: "Compound answer. DOB stored as 1943-01-01 (BUG). POB extracted correctly." },
  { turn: 3, question: "Community/neighborhood?", answer: "Father Joe (PE teacher), Mother Eva (hairdresser), brother Chris, Denver Road", loriText: true, ttsBefore: true, afterComplete: true, projUpdated: false, bbUpdated: false, nextCorrect: true, notes: "Multi-fact compound. Zero fields extracted to projection or candidates. Backend may have been unstable." },
  { turn: 4, question: "Daily life at home?", answer: "Dartford Grammar, history/English, blues/R&B, Keith Richards 1961", loriText: true, ttsBefore: true, afterComplete: true, projUpdated: false, bbUpdated: false, nextCorrect: true, notes: "Added to Story badge appeared. But projection fields remain empty." },
  { turn: 5, question: "Music with Keith?", answer: "Brian Jones, LSE correction, Rolling Stones 1962, Marquee Club", loriText: true, ttsBefore: true, afterComplete: false, projUpdated: false, bbUpdated: false, nextCorrect: true, notes: "Backend crashed after response. Chat service unavailable error. Correction test included." },
  { turn: 6, question: "Roots and influence?", answer: "Decca Records 1963, Satisfaction 1965, knighthood 2003, 60 years", loriText: true, ttsBefore: true, afterComplete: true, projUpdated: false, bbUpdated: false, nextCorrect: true, notes: "Message stacking bug (3 Lori prompts). Mode drifted to Companion briefly." },
  { turn: 7, question: "Knighthood experience?", answer: "Bianca 1971, Jerry Hall, four children, Charlie Watts 2021 death", loriText: true, ttsBefore: true, afterComplete: true, projUpdated: false, bbUpdated: false, nextCorrect: true, notes: "Added to Story badge. Lori handled grief sensitively. Still zero projection fields." },
  { turn: 8, question: "Feelings about Charlie?", answer: "Cricket, running 8mi/day, art collecting, history/politics, LSE callback", loriText: true, ttsBefore: true, afterComplete: false, projUpdated: false, bbUpdated: false, nextCorrect: true, notes: "Backend blip before response. Topic jump handled well by Lori." },
  { turn: 9, question: "Contemporary art?", answer: "Partial answer (declined politics), heart surgery 2019, life lesson", loriText: true, ttsBefore: true, afterComplete: true, projUpdated: false, bbUpdated: false, nextCorrect: true, notes: "Partial/vague answer test. Lori accepted gracefully. Later years content." },
];

// Build turn table rows
const turnHeaderRow = new TableRow({ children: [
  headerCell("Turn", 600), headerCell("Lori Text", 900), headerCell("TTS Before", 900),
  headerCell("After Complete", 1100), headerCell("Proj Updated", 1100),
  headerCell("BB Updated", 1000), headerCell("Next Q Correct", 1100), headerCell("Notes", 2660)
]});

const turnRows = turns.map(t => new TableRow({ children: [
  cell(String(t.turn), 600), passCell(t.loriText, 900), passCell(t.ttsBefore, 900),
  passCell(t.afterComplete, 1100), passCell(t.projUpdated, 1100),
  passCell(t.bbUpdated, 1000), passCell(t.nextCorrect, 1100), cell(t.notes, 2660)
]}));

// Bug table
const bugData = [
  { bug: "DOB normalization failure", severity: "HIGH", repro: "Enter DOB as text (Twenty-sixth of July, 1943). System stores 1943-01-01.", layer: "Backend extraction / normalizer" },
  { bug: "Full name not captured", severity: "MEDIUM", repro: "Say full name is Michael Philip Jagger. Only Mick stored as fullName.", layer: "Frontend projection / prefill_if_blank" },
  { bug: "Phantom time of birth", severity: "MEDIUM", repro: "Never mention birth time. System shows 1250p, 12:50 pm auto-parsed.", layer: "Backend extraction / normalizer" },
  { bug: "Projection pipeline non-functional", severity: "CRITICAL", repro: "After 9 turns with rich multi-fact answers, projection has 0 filled fields. Only identity gate data saved.", layer: "interview.js projection / extract.py" },
  { bug: "Candidate pipeline non-functional", severity: "CRITICAL", repro: "Mentioned 2 parents, 1 sibling, 2+ band members. Candidates tab shows 0 people.", layer: "projection-sync.js / candidate_only write mode" },
  { bug: "Message stacking on reconnect", severity: "HIGH", repro: "When backend recovers from outage, Lori sends 3-4 consecutive unprompted messages.", layer: "Frontend WebSocket / idle timer" },
  { bug: "Backend intermittent crashes", severity: "HIGH", repro: "Chat service unavailable errors appeared 4+ times during 9 turns.", layer: "server/code/api (uvicorn or LLM timeout)" },
  { bug: "Mode drift to Companion", severity: "LOW", repro: "During Turn 6, mode indicator briefly showed Companion instead of Life Story.", layer: "Frontend state / interaction mode logic" },
];

const bugHeaderRow = new TableRow({ children: [
  headerCell("Bug", 2800), headerCell("Severity", 900), headerCell("Reproduction", 3200), headerCell("Suspected Layer", 2460)
]});
const bugRows = bugData.map(b => new TableRow({ children: [
  cell(b.bug, 2800), cell(b.severity, 900), cell(b.repro, 3200), cell(b.layer, 2460)
]}));

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1B2A4A" },
        paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2E4057" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ]
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    }]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 }
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "Lorevox 8.0 \u2014 Confidential Test Report", italics: true, color: "888888", font: "Arial", size: 18 })] })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Page ", font: "Arial", size: 18, color: "888888" }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" })] })] })
    },
    children: [
      // TITLE
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [
        new TextRun({ text: "Mick Jagger Live Conversational Test Report", bold: true, font: "Arial", size: 44, color: "1B2A4A" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [
        new TextRun({ text: "Lorevox 8.0 \u2014 LLM + TTS + Extraction Latency Validation", font: "Arial", size: 24, color: "555555" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [
        new TextRun({ text: "Test Date: March 31, 2026 | Tester: Claude (automated)", font: "Arial", size: 20, color: "888888" })
      ]}),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1B2A4A", space: 1 } }, children: [] }),

      // RUNTIME
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Runtime")] }),
      boldBodyText("UI started: ", "http://127.0.0.1:8080/ui/lori8.0.html \u2014 confirmed loaded"),
      boldBodyText("API started: ", "Port 8000 \u2014 UNSTABLE (multiple crashes during test)"),
      boldBodyText("LLM active: ", "Yes \u2014 Claude-based interview engine (when backend available)"),
      boldBodyText("TTS active: ", "Port 8001 \u2014 p335 speaker \u2014 UNSTABLE (went down with API)"),
      boldBodyText("Narrator: ", "Mick Jagger (Michael Philip Jagger) \u2014 created via + New flow"),
      bodyText("Note: Both API and TTS crashed multiple times during the test session. The backend had to be restarted by the operator at least once. This instability is a significant finding that impacts all other test results."),

      // TURN-BY-TURN TABLE
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Turn-by-Turn Latency Execution")] }),
      bodyText("9 conversational turns were executed covering: personal identity, parents, early life, education, early career, career progression, major achievements, personal challenges, interests/hobbies, and later years."),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [600, 900, 900, 1100, 1100, 1000, 1100, 2660],
        rows: [turnHeaderRow, ...turnRows]
      }),
      bodyText("Summary: Lori text rendering and TTS timing were reliable. Question flow was logical and contextual. However, projection and Bio Builder updates failed on every turn except the identity gate (Turns 1-2 partial). The extraction-to-projection pipeline is the primary failure."),

      new Paragraph({ children: [new PageBreak()] }),

      // EXTRACTION QUALITY
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Extraction Quality")] }),
      sectionHeading("Multi-field extraction"),
      boldBodyText("Result: ", "FAIL"),
      bodyText("Despite providing rich compound answers containing 4-6 facts each, the multi-field extraction pipeline produced zero projection field updates across all 9 turns. The Added to Story badge appeared on some turns, suggesting the backend story capture may be working independently of the projection system, but the structured extraction that populates Bio Builder fields is completely non-functional."),

      sectionHeading("Missed facts"),
      bodyText("Every conversational fact was missed by the extraction pipeline. Key examples: Father Basil Joe Jagger (PE teacher), Mother Eva (hairdresser), brother Chris, Dartford Grammar School, London School of Economics, Rolling Stones formation 1962, Marquee Club, Decca Records 1963, knighthood 2003, marriage to Bianca 1971, Jerry Hall, four children, Charlie Watts death 2021, heart surgery 2019, hobbies (cricket, running, art collecting)."),

      sectionHeading("Incorrect mappings"),
      bodyText("Three incorrect data points were found in the Personal Information section: (1) Full Name stored as Mick instead of Michael Philip Jagger. (2) Date of Birth stored as 1943-01-01 instead of 1943-07-26 \u2014 the text Twenty-sixth of July was not parsed. (3) Time of Birth shows 1250p, 12:50 pm auto-parsed despite never being mentioned \u2014 phantom data."),

      sectionHeading("Grouping issues"),
      bodyText("Cannot assess repeatable section grouping (parents, siblings) because zero candidates were created. The candidate_only and suggest_only write modes were never triggered during the test."),

      // CONVERSATION QUALITY
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Conversation Quality")] }),
      boldBodyText("Lori question flow: ", "PASS"),
      bodyText("Lori asked contextually appropriate questions that built on previous answers. She correctly referenced Denver Road, Dartford, Keith Richards, the Marquee Club, and Charlie Watts from the narrator\u2019s own words. She never introduced information the narrator hadn\u2019t mentioned (except one reference to Charlie in a question before it was discussed \u2014 minor)."),
      boldBodyText("Natural progression: ", "PASS"),
      bodyText("The conversation moved logically from identity through childhood, education, early career, achievements, personal life, hobbies, and later years. Lori respected the narrator\u2019s emotional boundaries (declined politics, grief about Charlie)."),
      boldBodyText("Repetition issues: ", "MINOR"),
      bodyText("After narrator switch and return, Lori asked about Dartford childhood again (already covered in Turns 3-4). Conversation history may not persist across narrator switches."),

      // LATENCY BEHAVIOR
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Latency Behavior")] }),
      boldBodyText("LLM delay manageable: ", "PASS \u2014 Responses generated within 5-10 seconds"),
      boldBodyText("TTS delay manageable: ", "PASS \u2014 When operational, TTS played within acceptable timeframe"),
      boldBodyText("No race conditions: ", "FAIL \u2014 Message stacking bug on reconnect (3-4 unprompted Lori messages)"),
      boldBodyText("No interruption required: ", "FAIL \u2014 Backend crashes required manual restart"),

      // PERSISTENCE
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Persistence")] }),
      boldBodyText("Reload: ", "PASS"),
      bodyText("Browser reload preserved all localStorage data. Narrator header (Mick, 1943-01-01, Dartford) restored. Projection drafts (5) and questionnaire drafts (13) intact. Lori resumed conversation with correct context."),
      boldBodyText("Narrator switch: ", "PASS"),
      bodyText("Switched from Mick to Mel Blanc and back. No data bleed. Mel Blanc session correctly showed San Francisco context. Mick session correctly showed Dartford context on return. localStorage counts changed by +1 (new Mel Blanc draft created, expected)."),

      new Paragraph({ children: [new PageBreak()] }),

      // BUGS
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Bugs Found")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 900, 3200, 2460],
        rows: [bugHeaderRow, ...bugRows]
      }),

      // PROS
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Pros")] }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Lori\u2019s conversational intelligence is genuinely impressive. Questions were contextual, empathetic, and built naturally on previous answers. She felt like a skilled interviewer, not a script reader.", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Persistence layer is solid. localStorage survived reload and narrator switch without data loss. The narrator isolation model works correctly with no cross-contamination.", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Identity gate (Pass 1) works end-to-end: name, DOB, and birthplace were captured and displayed in the narrator header. The onboarding flow is smooth.", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "TTS integration with p335 speaker is seamless when the backend is stable. Speech plays naturally and the UI correctly indicates readiness state via the status dot.", font: "Arial", size: 22 })
      ]}),

      // CONS
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Cons")] }),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "The extraction-to-projection pipeline is completely non-functional. After 9 rich conversational turns, zero fields were populated in the projection, zero candidates were created, and zero suggestions were queued. This is the core value proposition of the system and it does not work.", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Backend stability is unacceptable for a live conversational test. The API crashed 4+ times during 9 turns, requiring manual restart. This creates message stacking artifacts, lost extraction opportunities, and a broken user experience.", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Date normalization cannot parse written-out dates (Twenty-sixth of July). This is a basic NLP task that should be handled reliably.", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Phantom data in Time of Birth field (1250p) with no user input is a data integrity concern. The system is inventing biographical data.", font: "Arial", size: 22 })
      ]}),

      // KEY INSIGHT
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Key Insight")] }),
      sectionHeading("What felt intelligent"),
      bodyText("Lori\u2019s question generation is the strongest component. She listened, remembered, referenced prior answers, navigated emotional topics with care, and never felt mechanical. The conversational layer is genuinely ready for human testing. The interview engine\u2019s ability to maintain context across turns and generate relevant follow-ups is production-quality."),
      sectionHeading("What felt mechanical"),
      bodyText("The extraction and Bio Builder pipeline felt absent, not mechanical. There was no visible evidence that the system was understanding or structuring the rich biographical data being shared. The Added to Story badge appeared occasionally but produced no actual structured output. The system captures conversation but does not learn from it."),

      // FINAL STATUS
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 480 }, children: [new TextRun("Final Status")] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 },
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: "CC3333" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "CC3333" },
          left: { style: BorderStyle.SINGLE, size: 2, color: "CC3333" }, right: { style: BorderStyle.SINGLE, size: 2, color: "CC3333" } },
        children: [new TextRun({ text: "READY FOR NEXT ITERATION: NO", bold: true, font: "Arial", size: 32, color: "CC3333" })]
      }),

      // CRITICAL FAILURE REASONS
      sectionHeading("Critical failure reasons"),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Extraction misses ALL multi-fact answers (0/9 turns produced projection data)", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Bio Builder lags and misaligns (completely empty despite rich conversation)", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "Projection fails under latency (backend crashes break the extraction pipeline)", font: "Arial", size: 22 })
      ]}),
      new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [
        new TextRun({ text: "TTS/LLM timing causes state drift (message stacking on reconnect)", font: "Arial", size: 22 })
      ]}),

      bodyText("The conversational layer is strong. The extraction layer needs fundamental debugging before this system can advance. Recommended next step: isolate and fix the multi-field extraction pipeline with unit tests before retesting live conversation."),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/dreamy-affectionate-albattani/mnt/lorevox/docs/mick-jagger-live-conversational-test-report.docx", buffer);
  console.log("Report written successfully");
});
