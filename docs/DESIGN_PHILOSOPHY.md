# Strategic Product Design Analysis
## Evolving AI-Assisted Biography and Archive Platforms

> This document serves as the canonical design rationale for Lorevox's UX decisions from v5.2 onward. It explains the *why* behind choices that might otherwise appear cosmetic to future contributors. v5.3 (aa08c8b), v5.4 (86c67ec), and v5.5 (aa87d7e) are all shipped. All items in the Implementation Status Summary below are now complete.

---

The evolution of digital biography and personal archiving platforms represents a critical intersection of human-computer interaction design, archival science, and emotional ergonomics. As digital applications transition from functional prototypes to consumer-ready products, the developmental focus must invariably shift from underlying structural architecture to semantic precision, empathetic tone, and cognitive restraint. The software under evaluation — currently transitioning from version 5.1 to a highly refined version 5.2 — utilizes an advanced artificial intelligence agent to conduct personal interviews, capture historical memories, contextualize global events, and iteratively draft long-form narrative outputs such as memoirs and obituaries. While the foundational data models and programmatic logic demonstrate significant maturity, resolving residual user experience friction requires addressing advanced product design challenges.

A thorough heuristical evaluation of version 5.2 reveals that the application has successfully established "good bones." The implementation of focus modes, humanized interface copy, explicit profile readiness indicators, and transparent AI status states mark a decisive transition into a productized ecosystem. However, the system still occasionally communicates with the clinical cadence of an internal testing environment rather than the reverent tone of a digital memory vault. The remaining challenges are no longer strictly computational; they are matters of taste, tone, and restraint. The subsequent analysis provides an exhaustive roadmap for the 5.3 iteration, focusing on the eradication of developer-facing scaffolding, the realignment of user mental models regarding machine-generated versus human-authored content, the implementation of complex partial-state feedback, and the rigorous protection of cultural and emotional tone in the face of automated content generation.

---

## 1. Eradicating Developer Scaffolding from the Production Environment

> **Status:** ✅ Implemented in v5.3

A fundamental principle of sophisticated user experience design dictates that the internal mechanics, diagnostics, and telemetry of a system should remain entirely invisible to the end-user unless those mechanics directly serve a primary user goal. The persistence of diagnostic tools, internal taxonomy, and developer metadata within a production environment actively undermines user trust and disrupts the narrative immersion required for sensitive personal archiving. When users engage with software designed to capture their life's legacy, they must feel they are in a secure, curated studio, not a software laboratory.

The presence of diagnostic indicators — such as top-bar service pills denoting WebSocket connection stability, Text-to-Speech service status, or raw chat telemetry — forces the user into a monitoring posture rather than a reflective one. This phenomenon violates the aesthetic-usability effect, which posits that polished, visually cohesive interfaces are inherently perceived by users as more trustworthy, reliable, and capable. When users encounter backend terminology or debugging tools, the application feels mechanical, fragile, and experimental, raising subconscious alarms about data permanence and privacy.

To achieve a fully productized state, all developer-centric information must be strictly quarantined from the primary user interface. In modern software development ecosystems, this separation is typically managed through the implementation of role-based access controls or dynamic feature flags that effectively decouple code deployment from feature visibility. Diagnostic tools, raw connection states, and developer metadata should be entirely hidden from the standard user path. These elements should only be accessible via a global developer mode toggle, a hidden authentication gate, or a complex physical interaction (such as a multi-tap sequence on a logo) that a standard user would never trigger accidentally.

Furthermore, the system feedback language utilized within the conversational interface must be translated from technical telemetry into workflow-appropriate terminology. For example, a status indicator persistently labeled "Last reply" evokes the semantics of server monitoring, ping-response times, and chatbot diagnostics. In the context of an interview and archiving suite, this language must be recast to reflect the human-centric archival workflow.

| Current State | Recommended Archival State | Architectural Rationale |
|---|---|---|
| Visible Developer Info Panel | Hidden behind global dev mode toggle | Eliminates cognitive clutter and protects the emotional sanctity of the archival workspace. |
| Top-Bar Diagnostic Pills (Chat / TTS / WS) | Removed from production UI | Prevents the interface from resembling a testing or staging environment, reinforcing system stability. |
| "Last reply" system label | "Latest draft note" | Shifts the semantic framing from automated chatbot diagnostics to active, collaborative drafting. |

If the primary objective of a user interface element is operator debugging, it must be hidden by default. If its objective is to facilitate useful memory capture, then it must sound like an organic part of the biographical workflow. By systematically removing these last traces of technical scaffolding, the platform will project the quiet confidence and restraint expected of premium consumer software.

---

## 2. Archival Readiness and the Profile Experience

> **Status:** ✅ Implemented in v5.3

The discipline of personal digital archiving relies heavily on the ongoing, active curation of digital traces, emphasizing value assignment and the continuous recollection of life events. The central profile tab of a biographical application serves as the foundational anchor for this curation. It is the repository from which all subsequent narrative drafts, timelines, and memory prompts are derived. Consequently, the profile interface must transcend the sterile, administrative feel of a database entry form and evoke the sentiment of opening a structured, physical archive.

The nomenclature used within the profile tab heavily influences user perception and behavior. Currently, the application exhibits an internal semantic contradiction: labeling a primary data card "Identity" while the overarching page is titled "Person Profile." While functionally acceptable, "Identity" feels overly clinical and slightly generic, akin to enterprise identity management software. Unifying this language by shifting the card label from "Identity" to "Personal Details" grounds the experience in standard biographical and genealogical terminology, creating a more cohesive information architecture.

A significant upgrade in the current version is the introduction of an "Archive Readiness" framework. This is a highly sophisticated mechanism for gamifying data entry, reducing the overwhelming nature of blank canvas syndrome, and encouraging thoroughness. However, the language used within such checklists often defaults to clinical data validation schemas. By adjusting the verbiage to reflect active creation and momentum, the system fundamentally reframes the psychological nature of the task.

| Standard Validation Terminology | Archival Building Terminology | Psychological Impact |
|---|---|---|
| Date of birth | Date of birth added | Acknowledges user effort and completion. |
| Birthplace | Birthplace added | Transforms a static noun into a completed action. |
| Family map | Family started | Implies ongoing growth rather than a static chart. |
| Pets added | Pets added | Remains effective as an action-oriented phrase. |
| Profile saved | Profile saved | Confirms data persistence and security. |

This subtle semantic shift ensures the interface feels less like a mandatory compliance checklist and more like the active, rewarding process of archive building.

The user interface controls embedded within the profile must also align with established interaction design patterns to maximize usability. Currently, the quick-add actions for family members (e.g., "+ Mother," "+ Father") are styled as inline text links. In complex web applications, text links traditionally suggest navigation to a new page, whereas buttons suggest the execution of a functional action or state change. Converting these rapid-entry functions into small pill buttons with a faint border clearly communicates their function as product actions, enhancing discoverability and reducing interaction friction.

Furthermore, emotional design principles dictate that data fields carrying significant sentimental weight should not be relegated to generic, unguided input boxes. The inclusion of a "Pets" section is conceptually brilliant, as companion animals represent deeply resonant emotional touchpoints. However, visually treating this section as a standard sub-form fails to capture its narrative potential. Adding a visible, emotionally evocative field label, such as "Best remembered for," directly above the notes section distributes the emotional labor. It provides a guided prompt, inviting the user to share a specific, narrative-driven anecdote rather than confronting them with an intimidating, unstructured text box. This approach aligns with the core tenets of reminiscence therapy and guided digital storytelling.

---

## 3. Restructuring the AI-Human Mental Model in Interview Capture

> **Status:** ✅ Implemented in v5.3 (two-state chip: "Captured from Lori" / "Edited by hand")

The most critical architectural and psychological challenge in any AI-assisted biography platform lies in establishing an unambiguous boundary between the artificial intelligence agent and the human subject. When an AI system conducts an interview to extract personal history, the resulting text artifact is the intellectual and emotional property of the human being. The AI acts merely as a facilitator, transcriber, and organizer.

In the current iteration of the interview interface, the text area where the subject's spoken or typed memories are collected is labeled "Lori's answer," and the empty state is populated with placeholder text stating, "Lori's reply appears here automatically." This design choice establishes a fundamentally flawed mental model. It implies that the human user is managing the synthetic output of an AI assistant, rather than capturing the sacred, lived testimony of an interviewee. The user is not generating a machine response; they are utilizing an agent to document human memory.

Leading competitors in the digital memoir space approach this distinction through varied methodologies. Platforms like Storyworth rely entirely on asynchronous human writing, sending weekly email prompts that users reply to via text, ensuring 100% human authorship. Platforms like Remento prioritize voice-first storytelling, recording the user's spoken words and utilizing AI strictly to remove filler words and clean up transcripts, deliberately maintaining the authentic conversational tone of the original recording. If the platform under review intends to use a conversational AI agent to mediate the interview, the interface must ruthlessly protect the human origin of the captured data.

To rectify this mental model, the platform must adopt precise disclosure and attribution patterns. The label above the primary text area must be immediately changed from "Lori's answer" to "Captured answer," firmly attributing the content to the human subject. The placeholder text must similarly invite human curation and clarify the data flow: "The answer can be captured from Lori or typed here directly. Edit freely before saving." This framing empowers the user, establishing the AI as a mere conduit for human expression.

The visual interface must also support this distinction through clear, dynamic state indicators. In the broader landscape of generative AI user experience, establishing content provenance is a paramount concern. When the AI agent successfully populates the field based on a spoken conversation, displaying a chip reading "✓ Captured from Lori" provides necessary and transparent system status feedback. However, to complete the feedback loop, build user trust, and adhere to best practices for AI collaboration, the system must recognize human intervention. The moment the user clicks into the text area and manually edits the transcript, the chip must automatically transition to read "Edited by hand."

| AI Interaction State | UI Indicator / Attribution Badge | Rationale for Design Pattern |
|---|---|---|
| Initial AI Population | "✓ Captured from Lori" | Provides transparent disclosure that the initial text was transcribed or synthesized by the agent. |
| User Modifies Text | "✎ Edited by hand" | Transfers ownership back to the human, increasing trust and verifying the content's authenticity. |

This dynamic badging assures the user that their editorial authority is absolute and that the final artifact is recognized as human-verified, distinguishing it from raw, unverified AI generation.

### Interview Button Iconography

> **Status:** ✅ Implemented in v5.4

The buttons to control the session — ▶ Begin Section, ↻ Ask Again, and ⤼ Skip for Now — currently rely on symbols that project a media-player or control-panel aesthetic. In deeply emotional workflows involving the excavation of personal history, mechanical symbols can inadvertently trivialize the interaction. Removing the icons and relying purely on well-set typographical buttons (Begin Section, Ask Again, Skip for Now) strips away the tooling aesthetic, emphasizing the gravity, dignity, and human-centric nature of the task.

---

## 4. Evocative UX for Memory Triggers and Contextual Retrieval

> **Status:** ✅ Implemented in v5.3

A defining feature of modern, sophisticated biographical tools is their ability to leverage historical, cultural, and chronological context to spark organic recollection. The human memory is highly associative; abstract prompts often fail to elicit detailed responses, whereas anchoring a prompt to a specific global event, popular song, or technological shift can unlock vivid, cascading memories.

The evolution of this feature from a clinical "Context Engine" to the vastly superior nomenclature of "Memory Triggers" is a masterclass in product positioning. It aligns the interface with psychological reminiscence therapy and human storytelling traditions.

The taxonomy utilized to categorize these memory triggers deeply impacts user immersion and logical discovery. Currently, the triggers are grouped under broad, high-level headers such as "Events" and "Culture." This creates a subtle structural mismatch. Sub-domains of intimate lived experience, such as "Cars," "Music," and daily routines, are not peer categories to high-level, macro-societal "Culture." A more evocative, human-centric grouping strategy divides the triggers into two distinct spheres:

- **History:** Encompassing War, Technology, Politics, Health, and Economics.
- **Everyday Life:** Encompassing Culture, Cars, Music, and Fashion.

This taxonomic restructuring mirrors human cognitive recall, which naturally separates major geopolitical anchors (macro-historical events) from the tactile aesthetics of daily living (micro-personal memories).

The interaction design of these triggers must also be explicitly communicated to the user. Changing the mechanical explanation — "Click any event to drop a memory question into Lori's chat" — to the deeply empathetic — "Click any event to have Lori ask about that moment in the person's life" — centers the human subject and clarifies the agent's role as a conversational facilitator.

### Permanent Age-Filter Explainer

> **Status:** ✅ Implemented in v5.5

Context strips that dynamically filter events based on the subject's calculated age require explicit explanation to prevent user confusion. A user might wonder why events from 1945 are missing if the subject was born in 1950. Adding a clarifying, permanently visible line — "Showing events from childhood through later life" — removes the cognitive burden of deducing the algorithmic filtering logic, making the tool feel intelligently supportive.

---

## 5. Designing for Partial States in Long-Form Content Generation

> **Status:** ✅ Implemented in v5.3 (In progress chapter state, updated copy)

The generation of long-form, complex digital artifacts — such as a cohesive memoir draft or a comprehensive chronological life timeline — is an inherently non-binary process. Traditional software operates on a strict incomplete/complete paradigm. However, AI-driven content synthesis involves massive data retrieval, computational processing time, incremental drafting, and iterative human review. A mature, trustworthy interface must elegantly accommodate these partial states to prevent user anxiety, manage expectations of processing time, and maintain confidence in the system's stability.

### Memoir Draft Workflows

The "Memoir Draft" tab serves as the narrative culmination of the interview process. The renaming of this section to "Memoir Draft" correctly sets the expectation that the output is malleable and subject to revision. The internal card labels — "Chapter Map" and "Memoir Draft" — immediately upgrade the perceived value of the workspace. They frame the interface as a professional, structured writing studio rather than a mere data output directory.

Crucially, the status indicators for individual chapters must reflect the reality of gradual data accumulation. Relying solely on a binary "Ready" or "Not started" status creates a harsh dichotomy that fails to acknowledge partial material collected during ongoing, non-linear interviews. The introduction of an "In progress" state is vital for user psychology. Even if the backend architecture is not yet mathematically computing exact completion percentages based on token counts or prompt coverage, designing the interface to accommodate an "In progress" state acknowledges that human memory gathering and memoir generation are continuous, iterative processes.

To further build trust in the AI's output, the system must clearly establish data provenance. Adding a subtle source attribution line directly above the text editor — "Built from completed interview sections and saved timeline context" — clarifies the data pipeline. This proves to the user that their prior emotional labor in the interview stages is actively fueling the current output, mitigating fears of AI hallucination and reinforcing the value of the platform's interconnected modules.

### Timeline Architecture and Narrative Framing

The chronological timeline is the structural backbone of any biographical endeavor. Version 5.2's decision to segregate timeline events into "Personal Milestones" and "World Context" is a highly effective information architecture strategy. It prevents intimate family moments from being visually overwhelmed by massive geopolitical events.

To achieve narrative framing, the timeline interface requires a permanent, descriptive summary at the apex of the view: "A life history built from interview milestones and historical context."

The handling of the timeline's empty state is equally critical. An empty timeline should not feel like a broken or missing feature; it should feel expectant and instructional. Text stating, "No timeline events yet. Complete interview sections or save memories from Memory Triggers to begin building the timeline," guides the user toward productive action and reinforces the interconnectedness of the application.

Finally, the UI mechanisms used to control the timeline view must reflect state toggles rather than destructive commands. A button currently labeled "Hide World Context" implies a permanent removal or a harsh command. Replacing this with a toggle labeled "World Context: On / Off" clearly communicates a reversible, temporary display preference, reducing user hesitation.

---

## 6. Protecting Voice, Tone, and Cultural Nuance in Obituary Drafting

> **Status:** ✅ Fully implemented — source-locking modal shipped in v5.5

The drafting of an obituary is unequivocally the most emotionally volatile and culturally sensitive interaction within any biographical application. It requires a delicate, highly respectful balance of factual accuracy, narrative grace, and profound cultural sensitivity. The application must treat the Obituary tab as a protected, hallowed space where the preservation of the family's authentic voice and cultural heritage is paramount.

The action language dictating the automated generation of the obituary must be carefully calibrated to avoid sounding mechanical or insensitive. Buttons labeled with symbols and phrasing like "↺ Auto-Fill from Profile" and "✨ Generate via Lori" feel dangerously close to automated, soulless data processing. Softening these actions to purely textual buttons reading "Fill from Profile" and "Write with Lori" frames the AI as a collaborative, respectful assistant rather than an autonomous, unfeeling author.

### Data Source Locking and Non-Destructive Editing

> **Status:** ✅ Implemented in v5.5

Because obituaries blend hard, deterministic data (dates of birth/death, lists of surviving relatives) with highly subjective narrative reflections, the system interface must clearly distinguish between a "Filled from Profile" draft and a "Written with Lori" draft. This distinction is not merely aesthetic; it necessitates robust data-syncing safeguards and explicit user permission models.

If the user is working strictly within a profile-filled draft, the text area may safely regenerate as underlying facts in the Profile or Family Map are updated. However, if the draft is a Lori-generated narrative — or more critically, if it has been manually edited by the human user to capture a specific tone — underlying profile changes must **never silently overwrite the text.**

Silent data overwriting in an emotionally charged document instantly destroys user trust. The system must implement strict source-locking behavior. If the system detects a manual edit, it must lock the text field. If the user subsequently clicks a "regenerate" or "update facts" button, the system must present a modal warning:

> *"Generating a new draft will replace your current edits. Do you want to proceed?"*

This friction is a necessary feature, not a bug, ensuring that painstakingly crafted human prose is never erased by an overzealous automated function.

### Cultural Specificity, Demographic Nuance, and the Tone Selector

The inclusion of an AI tone selector (offering branches such as Traditional, Family, and Warm) is a powerful mechanism for adjusting the emotional resonance of the generated text. However, such generative tools risk producing highly formulaic, culturally sterile templates if they are not anchored in a deep awareness of diverse mourning traditions.

To fully grasp the absolute necessity of varied tone, non-destructive editing, and the protection of manual inputs, one must examine specific demographic use cases where death rituals and memorialization are heavily codified by centuries of tradition. A standardized, generic Anglo-American obituary format will fundamentally fail to capture the essence of a life lived in a culturally distinct community.

Consider, for example, the demographic landscape of Northern New Mexico — specifically municipalities like Las Vegas, NM. Demographic data indicates that Las Vegas has a population of approximately 13,100 people, with an overwhelming 77.7% identifying as Hispanic. In this specific geographic and cultural enclave, funeral traditions and the language of memorialization are deeply woven into the communal, historical, and religious fabric of the region.

In Northern New Mexican Hispanic communities, death is rarely approached with hushed, isolated, private mourning. Instead, it is characterized by extended, deeply communal participation that blends Spanish Catholic traditions with indigenous Mesoamerican influences. The *velorio* (wake) is historically a profound gathering, sometimes lasting 24 to 48 hours, functioning as an immediate circle of support filled with storytelling, shared meals (often featuring traditional foods like *pan dulce*), and communal prayer. This is almost always followed by a formal Catholic funeral mass, the recitation of the rosary, and a *novenario* — nine consecutive days of collective prayer dedicated to the deceased.

Furthermore, the legacy of remembrance in this region is uniquely institutionalized in highly visible cultural practices. This includes the construction and maintenance of *descansos* — elaborate roadside memorials marking sites of tragic loss — and the vibrant, joyous annual observances of *Día de los Muertos* (Day of the Dead), where families build *ofrendas* (altars) to welcome back the spirits of their ancestors. Historically, mourning was also visibly signaled within the community for extended periods, such as women wearing the *tápalo* (black mourning shawl) for a full year following a passing.

When a user sits down to utilize a digital platform to draft an obituary for a family member from a culturally rich background such as this, a sterile, mechanically generated AI summary focusing solely on employment history and a list of dates is entirely insufficient, and bordering on culturally erasing. An obituary in this specific context must reflect the warmth of the *velorio*, the deep integration of extended, multi-generational family networks, and the spiritual continuation of life. It requires a vocabulary that honors the communal nature of the grief process.

If the AI engine generates a "Warm" or "Family" tone draft, it is merely providing a baseline structural foundation. The true value of the tool emerges when the user can seamlessly edit that foundation to include highly specific cultural signifiers, bilingual phrasing (e.g., terms of endearment, or specific Spanish religious references), or precise scheduling details regarding the rosary, the mass, and the *novenario*.

Because an AI, regardless of its training data, cannot perfectly intuit the highly specific intersection of a family's personal dynamics and their regional cultural practices, the human user must remain the ultimate arbiter of the text. The interface must never risk erasing a user's careful, emotional inclusion of these vital cultural markers through an accidental automated profile refresh or a background data sync.

| Feature | Generic AI Risk | Culturally Responsive UX Solution |
|---|---|---|
| Auto-Regeneration of Text | Silent overwriting of user-inserted cultural terms (e.g., *velorio*, *novenario*). | Strict source-locking; modal warnings before any AI overwrite of human-edited text. |
| Tone Selection | Production of formulaic, culturally sterile paragraphs. | Soft defaults; positioning the tool as a starting point for bilingual or culturally specific human refinement. |
| Action Button Copy | "Generate via Lori" implies machine authorship and lack of human soul. | "Write with Lori" emphasizes collaboration and respects the emotional weight of memorialization. |

---

## Implementation Status Summary

| Area | Change | Status |
|---|---|---|
| Top bar | Status pills behind dev-mode toggle | ✅ v5.3 |
| Top bar | Developer info hidden by default | ✅ v5.3 |
| Profile | "Personal Details" label | ✅ v5.3 |
| Profile | Archive readiness verbs ("added", "started") | ✅ v5.3 |
| Profile | Quick-add buttons with + prefix | ✅ v5.5 |
| Profile | "Best remembered for" pet label | ✅ v5.3 |
| Interview | "Captured answer" label | ✅ v5.3 |
| Interview | Two-state capture chip (Captured / Edited) | ✅ v5.3 |
| Interview | "Helpful Memory Prompts" accordion | ✅ v5.3 |
| Interview | Remove ▶ ↻ ⤼ icons from buttons | ✅ v5.4 |
| Memory Triggers | "History" / "Everyday Life" filter groups | ✅ v5.3 |
| Memory Triggers | "Have Lori ask about that moment" subtitle | ✅ v5.3 |
| Memory Triggers | Permanent age-filter explainer line | ✅ v5.5 |
| Timeline | "World Context: On / Off" toggle | ✅ v5.3 |
| Timeline | "How this timeline grows" hint card | ✅ v5.3 |
| Timeline | Subtitle added | ✅ v5.3 |
| Memoir | "Chapter Map" / "Memoir Draft" labels | ✅ v5.3 |
| Memoir | "In progress" chapter state | ✅ v5.3 |
| Memoir | Source attribution line | ✅ v5.3 |
| Obituary | "Fill from Profile" / "Write with Lori" | ✅ v5.3 |
| Obituary | "Filled from Profile" / "Written with Lori" indicators | ✅ v5.3 |
| Obituary | Warning text about Lori-generated draft | ✅ v5.3 |
| Obituary | Source-locking modal on human-edited text | ✅ v5.5 |
| Chat | "Latest draft note" label | ✅ v5.3 |
| Chat | Updated placeholder | ✅ v5.3 |

---

## Works Cited

1. AI UX Design Patterns Research — Birdzhan Hassan, Medium
2. Testing in Production to Stay Safe and Sensible — LaunchDarkly
3. Ideas on reasonable ways to hide a dev page — Reddit r/webdev
4. Is it ok to hide a "Developer mode" in my app? — Stack Overflow
5. Best practices for hidden debug menu for live app — Reddit r/iOSProgramming
6. Personal digital archives: preservation of documents, preservation of self — UT Austin
7. Information architecture design in UX: complete guide [2025] — Full Clarity
8. Ten UX design patterns for Apps — Arpit Goliya, Medium
9. Emotional Architecture for Everyday Life — TDX
10. Beyond functionality: how emotional design transforms digital experiences — Metyis
11. Design requirements for a digital storytelling application for people with MCI — PMC/NIH
12. A guide to the differences between Storyworth and Remento — Storyworth
13. Read the Guide: Remento v. Storyworth — Remento
14. 17 Best Tools to Capture and Preserve Family Stories in 2025 — Remento
15. Remento Reviews & Alternatives — Storyworth
16. AI UX Patterns | Disclosure — ShapeofAI.com
17. C2PA User Experience Guidance for Implementers — spec.c2pa.org
18. Designing for AI-Generated Content: The New Design Challenge — Medium
19. Any trends or examples of how to distinguish between AI and human generated content? — UX Stack Exchange
20. The writing is the design — Oluwatosin Obalana, UX Collective
21. Create a Genealogy Timeline with AI: Getting Started — Generations Genealogy
22. Progress easily — U.S. Web Design System (USWDS)
23. Design Patterns: Progressive Disclosure for Mobile Apps — Nick Babich, UX Planet
24. UI/UX Design for AI Products: A Complete Guide — Aalpha
25. State Pattern: The Key to Seamless and Predictable User Experiences — Raw.Studio
26. UX design patterns for Progress — Muzli Design Inspiration
27. Designing for different states in the UI — Shane Doyle, UX Collective
28. UI states are important!! — Pakhi Mangal, Medium
29. Principles For Digital Preservation — Communications of the ACM
30. UX Patterns for Building Exceptional SaaS Applications — Wicar Akhtar, Medium
31. Exploring AI design patterns in SaaS products — UX Studio
32. Las Vegas, NM | Data USA
33. Las Vegas, New Mexico — Wikipedia
34. Las Vegas, New Mexico — NMCDM
35. Mexican Traditions For Funerals And Remembrance — Cremation.Green
36. Hispanic Funeral Traditions are rich in Cultural — FuneralsYourWay
37. Time after Time: New Mexico's Día de los Muertos Celebrations — New Mexico Magazine
38. Funerals at OLOS — Our Lady of Sorrows, Las Vegas, NM
39. Ancient Death Rituals Run Deep in New Mexico — New Mexico Humanities
40. Eugenio Gurule Obituary (2021) — Legacy.com
41. Embracing Death: Mexican Parent and Child Perspectives on Death — PMC/NIH
