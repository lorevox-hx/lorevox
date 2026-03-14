# **Technical Architecture and Ethical Governance of Empathetic Archival Systems: A Comprehensive Review of Lorevox v6.1**

The digital preservation of human history has evolved from simple text-based repositories to sophisticated, agent-driven ecosystems capable of interpreting the emotional and physiological nuances of the subject. Lorevox v6.1, as a pioneering "Life Archive Studio," represents a significant paradigm shift in the intersection of modular front-end architecture, on-device machine learning, and trauma-informed human-computer interaction (HCI). The recent transition to a decoupled JavaScript logic layer, combined with the integration of "Track B" browser-side affect sensing, signifies a strategic movement toward a "local-first" philosophy that prioritizes user privacy and emotional safety.1 This report provides an exhaustive analysis of the structural, technical, and legal frameworks governing Lorevox v6.1, evaluating its capacity to serve as a safe, private, and empathetic witness to the human experience.

## **Modular Frontend Architecture and the Paradigm of Decoupled Logic**

The structural integrity of Lorevox v6.1 is underpinned by a modular, CSS variable-driven grid system that facilitates a reactive and adaptive user interface. By separating the primary application logic from the visual presentation layer, the system achieves a level of "Architectural Agility" that is essential for maintaining complex archival workflows.1 This decoupling is not merely a refinement of coding standards but a prerequisite for the high-performance inference required for real-time multimodal AI integration.3

## **Structural Shell and Dynamic Grid Management**

The application is encapsulated within a global .shell container that occupies the full viewport height (![][image1]), utilizing a vertical flexbox to manage the fixed-height top bar and the flexible body.1 The core of the interface is the .grid-layout, which employs CSS Grid to establish a three-pane structure: the Sidebar (Left), the Main Stage (Center), and the Chat Panel (Right).1 The modularity of this grid is primarily driven by CSS variables—specifically \--sb-w for the sidebar and \--chat-w for the chat panel—which allow for instantaneous layout transitions through simple class overrides.1

| Layout Class | Variable Adjustment | Functional Impact |
| :---- | :---- | :---- |
| .sb-closed | \--sb-w: 0px | Collapses the sidebar to maximize workspace. |
| .chat-closed | \--chat-w: 0px | Hides the AI interaction panel. |
| .focus-mode | Both set to 0px | Isolates the Main Stage for deep archiving. |
| .sb-body | overflow-y: auto | Enables independent internal scrolling. |

This dynamic structure ensures that the system remains responsive across a wide range of devices. At screen widths below ![][image2], the grid management logic forces both sidebars to ![][image3], effectively defaulting to a focus-style view that preserves the primary content area.1 This responsive adaptability is critical for archival sessions that may occur on mobile or tablet devices in domestic or clinical settings.5

## **Event Delegation and Modular Event Listeners**

In large-scale JavaScript applications like Lorevox, the traditional method of attaching unique event handlers to individual DOM elements frequently leads to memory leaks and performance degradation.7 The separation of JavaScript logic in v6.1 enables the implementation of "Event Delegation," a technique where a single listener is attached to a parent container (such as the \#peopleList or \#roadmapList).7 This listener utilizes event bubbling to detect which child triggered the interaction, allowing the application to handle dynamically rendered elements without requiring the re-binding of logic.7

The transition away from inline onclick handlers toward modular event listeners also enhances the security of the application. By centralizing logic, developers can implement strict Content Security Policies (CSP) that disallow the execution of inline scripts, thereby mitigating the risk of cross-site scripting (XSS) attacks in environments that handle sensitive biographical data.8

## **Semantic Design Tokens and Systemic Theming**

Lorevox v6.1 utilizes a sophisticated hierarchy of design tokens defined in base.css to manage the visual atmosphere of the archive studio.1 These tokens establish a "v6 surface stack" that uses color and elevation to create a sense of depth and focus, which is essential for reducing cognitive load during intensive memory recall.1

## **The Surface Stack and Typography Tokens**

The system's dark-mode first hierarchy is defined through a progression of background layers, allowing components to appear visually distinct without the use of harsh borders.1

| Token Name | Hex Code | Systemic Application |
| :---- | :---- | :---- |
| \--bg | \#14161b | The base page background. |
| \--panel | \#1a1d24 | Sidebar and navigation isolation. |
| \--card | \#20242d | Primary content containers. |
| \--card-2 | \#262b36 | Secondary or nested containers. |
| \--elev | \#2c3240 | Floating elements and modals. |

The typography system complements this surface stack by prioritizing legibility. The primary font, Inter (sans-serif), is used for technical and navigation elements, while Cormorant Garamond (serif) is reserved for the .prose-area, creating a "literary" and "archival" feel for the memoir drafts.1 This intentional shift in typography signals to the user that they have transitioned from data entry to the reflective act of storytelling.

## **Semantic Accent Colors and Emotional Resonance**

The accent system in Lorevox is categorized by functional intent, providing immediate visual feedback on the state of the application and the nature of the data being processed.1

| Accent Category | Representative Color | Semantic Meaning |
| :---- | :---- | :---- |
| Primary Action | Indigo-blue (\#7c9cff) | Standard navigation and system flow. |
| AI / Reflection | Digital Lavender (\#c6a7ff) | Affect sensing and AI-assisted reflection. |
| Personal / Warm | Coral (\#ff9b6b) | Family mapping and cultural heritage. |
| Success / Safe | Green (\#6ee7a8) | Captured data and completed roadmap items. |
| Caution / Review | Gold (\#f6c453) | Unsaved work or sensitive content review. |
| Alert / Danger | Red (\#ff7b7b) | Destructive actions or safety overrides. |

This color-coded strategy extends to the AI assistant's status. The .lori-status indicator uses animations like lori-breathe (pulse and scale) and lori-pulse (opacity only) to communicate states such as "Thinking," "Drafting," and "Listening".1 These animations provide "Soft Interaction," ensuring the user is aware of the AI's presence without the interaction feeling intrusive or distracting.

## **Browser-Side Affect Sensing and Computer Vision Integration**

Version 6.1 introduces "Track B," a sophisticated system for browser-side affect sensing that leverages Google's MediaPipe framework.1 This capability allows the AI interviewer, Lori, to "see" the user's emotional responses in real-time, facilitating more personalized and empathetic questioning.1

## **MediaPipe Face Mesh and Geometric Feature Extraction**

The sensing engine is powered by face\_mesh.js and camera\_utils.js, which process the webcam feed entirely on the client's device.1 MediaPipe Face Mesh utilizes a deep neural network to estimate ![][image4] to ![][image5] 3D facial landmarks in real-time.14 This geometry-based approach is superior to 2D heatmap methods, as it allows for the prediction of depth (![][image6]\-coordinates) without the need for a dedicated depth sensor.16

The landmark detection model operates on a series of subgraphs within a MediaPipe graph:

1. **BlazeFace Detector:** A lightweight face detector optimized for mobile GPUs that identifies the presence of faces and provides a bounding box.15  
2. **Face Landmark Model:** A regression-based model that maps the 3D surface geometry of the face.16  
3. **Attention Mesh (Optional):** An advanced refinement that applies extra computational focus to semantically meaningful regions like the lips, eyes, and irises, improving accuracy for subtle micro-expressions.17

## **Blendshape Prediction and FACS Mapping**

The system's ability to interpret emotion is derived from ![][image7] blendshape scores, which are coefficients representing specific facial muscle movements.15 These blendshapes are semantically aligned with the Facial Action Coding System (FACS) and its constituent Action Units (AUs).18 By analyzing the weighted sum of these blendshape displacements from a neutral face mesh, the system can quantify emotional intensity with high precision.14

| Emotion | Core Action Units (AUs) | Facial Indicators |
| :---- | :---- | :---- |
| Happiness | 6, 12 | Cheek raiser, lip corner puller (smile). |
| Sadness | 1, 4, 15 | Inner brow raiser, brow lowerer, lip corner depressor. |
| Surprise | 1, 2, 5, 26 | Inner/outer brow raisers, upper lid raiser, jaw drop. |
| Fear | 1, 2, 4, 5, 7, 20, 26 | Wide eyes, tense lids, stretched lips, dropped jaw. |
| Anger | 4, 5, 7, 23 | Brow lowerer, upper lid raiser, lid tightener, lip tightener. |
| Disgust | 9, 15, 16 | Nose wrinkler, lip corner depressor, lower lip depressor. |
| Contempt | 12, 14 | Lip corner puller, dimpler (often unilateral). |

The v6.1 architecture utilizes these mathematical outputs to drive the "Affect Arc," a visual timeline that maps the subject's emotional journey during the interview.1 This arc provides a longitudinal view of the interaction, allowing the archivist to identify moments of deep engagement or potential distress.

## **The Affect Arc Visualization Taxonomy**

The visual representation of emotional states in affect.css uses a precise color vocabulary designed for high contrast and professional aesthetics.1

| Affect State | Color Hex | Psychological Intent |
| :---- | :---- | :---- |
| Steady | \#475569 | Baseline; calm and stable engagement. |
| Engaged | \#6ee7a8 | Active interest and participation. |
| Reflective | \#93c5fd | Deep thought; introspective processing. |
| Moved | \#c6a7ff | Significant emotional resonance (Primary goal). |
| Distressed | \#f6c453 | Rising tension; signal for system caution. |
| Overwhelmed | \#ff9b6b | High arousal; potential for crisis trigger. |

The status of the sensing hardware is communicated via a pulsing .camera-dot. When active, it features a rhythmic ![][image8]\-second animation (cam-pulse) that toggles opacity and creates a glowing box-shadow "halo" effect.1 This constant feedback is a critical component of "Informed Presence," ensuring the user is always aware of when their biometric data is being analyzed.

## **Safety Frameworks and Crisis Intervention Protocols**

The nature of life archiving—often touching upon mortality, loss, and trauma—requires the implementation of high-priority safety interventions.22 Lorevox v6.1 implements a multi-layered safety strategy defined in safety.css that leverages both structural isolation and assistive persona integration.1

## **High-Priority Safety Overlays and Focus Locking**

The most significant safety intervention is the .safety-overlay, a full-screen fixed element with a z-index of ![][image9], effectively isolating the user from the main application.1 This overlay utilizes a dark, near-opaque background (rgba(12,8,4,.88)) to dim the interface and refocus the user's attention on the crisis messaging.1 The overlay box features a deep background (\#1c1510) and a subtle orange-gold border, creating an "Emergency-Supportive" aesthetic that is distinct from the rest of the UI.1

The messaging within the overlay is delivered through a conversational bubble from the "Lori" persona, utilizing a soft cream text color (\#f0e4d0) and a generous line-height (![][image10]) for maximum readability during moments of high stress.1

## **Crisis Resource Cards and Information Hierarchy**

Immediately beneath the crisis message, the system presents .resource-cards—interactive units that provide direct contact information for support services.1 The design of these cards prioritizes actionable utility, separating the organization name from the contact method with a high-contrast visual hierarchy.1

| Card Element | Style Value | Functional Purpose |
| :---- | :---- | :---- |
| Name | 12px; Semi-bold | Identifies the resource (e.g., 988 Suicide & Crisis Lifeline). |
| Contact | 13px; Extra Bold | Highlights the phone number or text code in peach (\#e8a87c). |
| Hover State | Transition: .35s | Provides tactile feedback to indicate interactivity. |
| Expanded Panel | color: \#8a9ab5 | Offers secondary instructions or context in muted blue-grey. |

This resource strategy aligns with clinical best practices for AI crisis management, which emphasize referring vulnerable individuals to real-world resources like the ![][image11] hotline or the Crisis Text Line immediately upon detection of risk indicators.25

## **Sensitive Segment Management and Redaction Protocols**

Outside of immediate crisis intervention, Lorevox v6.1 provides a comprehensive system for flagging and managing "Sensitive Segments" within the narrative transcripts.1 Segments deemed sensitive are marked with a .rm-sensitive-icon (a yellow-gold lock) and a .sensitive-badge.1 These items are visually separated from the standard narrative using a .sensitive-quote style—italicized text with a ![][image12] vertical gold border on the left.1

The application includes a "Private Segments" tab (tab-review), which acts as a staging area where users or archivists can review flagged moments and decide whether to include or exclude them from the final Memoir or Obituary drafts.1 For high-stakes deletions, a secondary .confirm-dialog-overlay with an even higher z-index of ![][image13] and a red-tinted border (rgba(248,113,113,.28)) ensures that destructive safety actions are intentional and deliberate.1

## **Legal Landscapes and Regulatory Obligations for AI Agents**

The development of agentic AI systems in 2025 and 2026 must account for a rapidly shifting regulatory landscape focused on transparency, the prevention of self-harm, and the protection of minor users.22

## **US State Legislation: California and New York**

As of late 2025, California and New York have enacted landmark legislation specifically targeting "AI companions"—systems designed to simulate sustained human-like relationships and maintain ongoing personal dialogues.22

| Statute / Bill | Effective Date | Core Mandates |
| :---- | :---- | :---- |
| New York S 3008 | Nov 5, 2025 | Mandatory self-harm detection; crisis referrals; upfront AI disclosure. |
| California SB 243 | Jan 1, 2026 | Disclosure of AI identity; crisis protocols; annual safety reports to CDPH. |
| Illinois HB 1806 | Aug 1, 2025 | Restricts AI from making independent therapeutic decisions. |
| Utah HB 452 | May 2025 | Clear AI status disclosure; bans selling individual health data without consent. |

California’s SB 243 is particularly stringent regarding minor users. For users known to be minors, operators must remind them every three hours of interaction that the chatbot is not human and that they should take a break.31 Furthermore, v6.1’s "Archive Readiness" check is an essential technical response to these laws, as it ensures that the AI assistant, Lori, has sufficient biographical context to avoid asking intrusive or misplaced questions of vulnerable populations.1

## **The UK Online Safety Act (OSA) and Mandatory Reporting**

In the United Kingdom, the Online Safety Act 2023 imposes significant duties on user-to-user platforms to protect both children and adults from illegal content.34 Ofcom, the regulatory body, has the authority to fine non-compliant services up to 10% of their worldwide turnover.10

The OSA specifically identifies priority offences, including the encouragement of serious self-harm and child sexual exploitation and abuse (CSEA).34 The UK government has also proposed the "Crime and Policing Bill," which would introduce a new statutory duty for individuals in "regulated activities" (including those working closely with children in digital environments) to report known or suspected sexual abuse to the National Crime Agency (NCA).36

## **Federal US Obligations: The REPORT Act**

At the federal level, the "Revising Existing Procedures on Reporting via Technology Act" (REPORT Act), signed into law in May 2024, modernizes the reporting requirements for online service providers regarding child sexual abuse material (CSAM).39 The Act extends the mandatory preservation period for CyberTipline reports from ![][image14] days to one year and increases penalties for failing to report known violations.40

| Feature | REPORT Act (2024) | Impact on Developers |
| :---- | :---- | :---- |
| Preservation | One Year | Requires robust data retention for context around reports. |
| Scope | CSAM \+ Trafficking | Broadens the definition of reportable offenses. |
| Penalties | $850k \- $1M | Significant financial risk for non-compliance. |
| Minor Reporting | No Liability | Protects victims reporting their own images from prosecution. |

## **The Mandated Reporting Paradox in Local-First AI**

A critical conflict exists between the "Local-First" architectural ideal of absolute privacy and the legal mandates for reporting illegal acts or self-harm.43 In systems where inference runs entirely on the user's hardware and data is encrypted at rest via the Web Crypto API, the developer typically lacks "actual knowledge" of the content, which is the primary legal trigger for reporting obligations under 18 U.S.C. § 2258A.2

## **Knowledge vs. Monitoring in Autonomous Systems**

The Ninth Circuit, in *United States v. Rosenow*, clarified that "mandated reporting is different than mandated searching".45 Communications providers are not required to search their users' private data unless a specific "detection order" of last resort is issued by a judicial authority.45 This distinction is vital for Lorevox, as its "privacy by default" architecture ensures that no user data leaves the device without explicit consent, thereby shielding the developer from involuntary data access and maintaining the trust required for deep life archiving.2

However, the "Report Act" and emerging EU regulations seek to incentivize "Safety by Design," where platforms proactively implement on-device screening tools that trigger resource cards or de-escalation scripts without needing to send the underlying data to a central authority.48 v6.1’s implementation of v6.1’s "Private Segments" tab and affect-aware de-escalation protocols represents a middle path, where the system provides internal safety nets without breaching the architectural commitment to encryption and localized data ownership.1

## **Ethical Considerations in Sexual Violence Disclosure**

In the context of adult sexual assault disclosure, mandatory reporting can often be counterproductive, potentially leading to a loss of agency and retraumatization for the survivor.44 Research suggests that survivors should always have the option to make decisions about whether and when to report incidents.44 For AI agents, the ethical imperative is to provide a "Restricted Report" framework—similar to military SAPR models—where the victim is connected to support and advocacy services without a mandatory referral to law enforcement, unless there is an imminent threat of physical harm to others.25

## **Trauma-Informed Interviewing and Empathetic Scripting**

The efficacy of Lorevox as an archival tool depends heavily on its ability to employ "Trauma-Informed Interviewing" (TVI) techniques.54 These strategies are based on the neurobiology of trauma and an understanding of how extreme stress impacts memory encoding and retrieval.56

## **The Four Pillars of Trauma-Informed Interaction**

1. **Realization of Impact:** Recognizing that trauma has profound physical and social repercussions and framing the interaction through the lens of "injury" rather than "sickness".54  
2. **Recognition of Signs:** Detecting behavioral indicators of distress, such as "flat affect," dissociation, or hypervigilance, and utilizing affect sensing to pause or pivot the interaction.54  
3. **Response with Knowledge:** Integrating an awareness of trauma into every aspect of the system, from the phrasing of questions to the visual design of the interface.54  
4. **Avoidance of Retraumatization:** Ensuring that the interview does not replicate the power imbalances or the pressure of the original traumatic event.12

## **Dialogue Strategies and Response Scripts**

TVI consensus recommends the frequent use of open-ended questions in age-appropriate language.55 Questions should be designed to allow the victim to recall memories in a non-linear or "circular" manner, which is a common feature of traumatic memory.55

| Type of Question | Blaming / Inappropriate Form | Trauma-Informed / Empathetic Form |
| :---- | :---- | :---- |
| **Pacing** | "Why didn't you leave sooner?" | "What were some of the barriers to leaving? What gave you courage?" |
| **Validation** | "Are you sure? It sounds different now." | "I hear you, and I believe you. Take as much time as you need." |
| **Clarification** | "Explain why you did that." | "Can you tell me more about what was happening when this occurred?" |
| **Empowerment** | "We have to finish this now." | "Would you like to take a break or stop for today? You are in control." |

The AI assistant, Lori, must be scripted to mirror the survivor's language. If a user does not refer to an experience as "rape," the AI must not label it as such.51 Validating the user's feelings—"It makes sense that you would feel overwhelmed"—is more effective than providing one-size-fits-all advice.27

## **Memory Anchors and Grounding Techniques**

Lorevox v6.1 utilizes "Memory Triggers" and "Family Maps" as emotional grounding tools.1 The system specifically notes that "Pets are powerful memory anchors," which can be used to pivot a conversation toward positive, non-threatening topics if the affect-sensing system detects rising distress.1 This ability to "ground" the subject in the present is a vital safety feature for preventing dissociation or acute psychiatric symptoms during deep archiving sessions.26

## **Technical Implementation and Performance Optimization**

Executing sophisticated AI tasks locally in the browser requires significant computational optimization to avoid blocking the main thread.46 Lorevox v6.1 utilizes a combination of WebGPU and Web Workers to achieve high-performance multimodal inference.46

## **WebGPU: The High-Performance Compute Layer**

Unlike WebGL, which was designed for graphics rendering, WebGPU provides first-class compute shaders and storage buffers.46 These primitives are optimized for the matrix multiplications and attention computations required for transformer model inference.46 In 2025, WebGPU enabled speedups of up to ![][image15] compared to WASM for on-device tasks such as speech recognition (Whisper) and text generation (Phi-3).66

| Technology | Execution Path | Key Role in Lorevox |
| :---- | :---- | :---- |
| **WebGPU** | GPU | Real-time facial mesh evaluation and LLM inference. |
| **WebAssembly** | CPU | Fallback Path; Input normalization and tokenization. |
| **Web Audio API** | CPU | Audio format normalization and ![][image16] resampling for STT. |
| **Web Crypto API** | CPU | Local data encryption at rest (AES-GCM). |

## **Task Offloading and Web Workers**

To ensure a smooth user experience, Lorevox offloads heavy inference tasks to Web Workers using the postMessage API.2 This prevents the main UI thread from being blocked for more than ![][image17], which is the threshold for a "long task" that can cause perceptible lag or interface unresponsiveness.65 By loading quantized models (e.g., Q4 or Q8 bits) in a background thread, the system can provide real-time transcription and affect analysis without degrading the rendering of the ![][image5]\-point facial mesh.2

## **Multimodal Pipeline Architecture: The "Sandwich" Model**

Lorevox utilizes a "Sandwich Architecture" to orchestrate its real-time conversational features:

1. **Sensing (STT \+ MediaPipe):** The system captures the user's voice via the MediaStream API and their expressions via the webcam, performing on-device transcription and affect extraction.71  
2. **Processing (LLM):** The transcribed text and the detected affect state are fed into an on-device language model (e.g., Llama-3-8B), which functions as the "cognitive engine" for the interview.73  
3. **Expression (TTS):** The agent's text response is synthesized into natural speech using a Text-to-Speech engine that adjusts its prosody based on the detected emotional context.73

By using streaming responses (stream\_mode="messages"), the TTS engine can begin speaking while the LLM is still generating the remainder of the response, reducing perceived latency to under ![][image18] and maintaining the emotional flow of the conversation.73

## **Hardware Benchmarking and Inference Requirements**

The performance of a local-first system is inherently limited by the user's hardware.77 The NVIDIA RTX 5080 (Blackwell architecture) represents a high-end consumer option for running private archival studios.78

## **RTX 5080 AI Performance and VRAM Thresholds**

The RTX 5080 features ![][image19] CUDA cores and ![][image20] of GDDR7 memory.78 While the memory capacity is lower than the RTX 5090 (![][image21]), its high memory bandwidth (![][image22]) makes it exceptionally fast for models that fit within its VRAM.77

| Benchmark Test | Model (Quantization) | RTX 5080 Performance |
| :---- | :---- | :---- |
| **Phi-4** | Q4\_K\_M (![][image23]) | ![][image24] tokens/sec |
| **Qwen3-4B** | Q4\_K\_M (![][image25]) | ![][image26] tokens/sec |
| **Gemma-3-27B** | Q4\_0 (![][image27]) | ![][image28] tokens/sec |
| **Llama-3.3-70B** | Q3\_K\_L (Did not fit) | FALLBACK TO CPU (![][image29] tok/s) |
| **SDXL Image** | FP16 | ![][image30] sec/image |

The ![][image20] VRAM limit is a critical architectural constraint for archival developers. Models like the ![][image31] Llama-3.3 require significant quantization or GPU partitioning to run, and fallback to CPU inference results in high-latency responses that break the empathetic "presence" of the AI assistant.81 For digital archiving, where the focus is on a single-user interaction, the ![][image32] to ![][image33] parameter models represent the "sweet spot" for real-time responsiveness on current consumer hardware.77

## **Ethical Frameworks and the Future of Digital Memories**

The integration of agentic AI into the deeply personal process of life archiving raises profound questions about authenticity and "Contextual Vulnerability".23

## **Contextual Vulnerability and the Humanization of AI**

"Contextual Vulnerability" is a temporary state of susceptibility to harm arising from the interplay between a user's emotional state and an AI system's response.84 Regulators have expressed concern that "excessively agreeable" chatbots can mislead users into believing they are interacting with a human being who possesses genuine empathy.22

Lorevox v6.1 mitigates this risk through "Transparency by Default." The system includes regular notifications—required by laws like California SB 243—that reminders the user that they are communicating with an artificially generated assistant.30 By framing Lori as a "Helper" or "Assistant" rather than a "Friend" or "Therapist," the system ensures that the interaction remains grounded in archival reality.23

## **Data Sovereignty and the Right to Digital Privacy**

Local-first architectures empower users to exercise their rights under GDPR and other privacy frameworks, including the right to delete conversation history and export their data without third-party surveillance.2 The "Private Segments" feature in Lorevox v6.1 is a fundamental tool for "Data Minimization," ensuring that only the content the user specifically approves is included in the final public archive.1

As the archival industry moves toward 2026, the challenge will be to maintain this privacy while ensuring that systems can still provide the clinical and psychological support required for meaningful legacy preservation.22

## **Conclusions and Technical Recommendations**

Lorevox v6.1 exemplifies the successful transition from monolithic archival software to a modular, AI-integrated studio. The separation of logic, the implementation of on-device affect sensing, and the multi-layered safety strategy provide a robust foundation for the future of digital memories.

To further enhance the system's performance and ethical alignment, the following principles should be maintained:

1. **Privacy as an Architectural Fact:** Continue to prioritize WebGPU and WebAssembly for on-device inference. This "Privacy by Architecture" is the most effective way to manage the mandated reporting paradox and ensure the developer lacks the involuntary "actual knowledge" of private biographies.  
2. **Modular Logic for Jurisdictional Agility:** Maintain a decoupled JavaScript layer to allow for the rapid implementation of region-specific legal compliance (e.g., California’s 3-hour minor reminders) without refactoring the core archival engine.  
3. **Affect-Aware Safety Nets:** Calibrate the affect sensing system to act as an early-warning signal for "Contextual Vulnerability." The system should offer breaks or positive memory anchors before a subject reaches a state of "Overwhelmed" or "Distressed."  
4. **Hardware-Conscious Model Selection:** Optimize for the ![][image20] VRAM limit of standard consumer hardware like the RTX 5080\. Quantization levels (e.g., 4-bit) should be selected to ensure token generation speeds remain high enough to preserve the illusion of natural conversation.  
5. **Empowerment through Choice:** Maintain the focus on trauma-informed design, prioritizing user agency and choice over automated narrative generation. The user must remain the final curator of their own life story.

The synthesis of high-performance computing and deep psychological insight in Lorevox v6.1 ensures that the preservation of human legacies is conducted with the dignity, privacy, and safety that the subjects deserve.

#### **Works cited**

1. 6.1.html  
2. The Definitive Guide to Local-First AI: Building Privacy-Centric Web Apps in 2026 \- SitePoint, accessed March 13, 2026, [https://www.sitepoint.com/the-definitive-guide-to-localfirst-ai-building-privacycentric-web-apps-in-2026/](https://www.sitepoint.com/the-definitive-guide-to-localfirst-ai-building-privacycentric-web-apps-in-2026/)  
3. What Changes in Frontend Architecture When AI Enters the Product | by AlterSquare, accessed March 13, 2026, [https://altersquare.medium.com/what-changes-in-frontend-architecture-when-ai-enters-the-product-08617974e14b](https://altersquare.medium.com/what-changes-in-frontend-architecture-when-ai-enters-the-product-08617974e14b)  
4. Building Real-Time AI Chat: Infrastructure for WebSockets, LLM Streaming, and Session Management \- Render, accessed March 13, 2026, [https://render.com/articles/real-time-ai-chat-websockets-infrastructure](https://render.com/articles/real-time-ai-chat-websockets-infrastructure)  
5. Best Web Application Frameworks Guide 2025 \- Sencha.com, accessed March 13, 2026, [https://www.sencha.com/blog/selecting-the-ideal-web-application-framework-a-comprehensive-guide/](https://www.sencha.com/blog/selecting-the-ideal-web-application-framework-a-comprehensive-guide/)  
6. 7 Essential Guidelines for Building an Ethical AI Chatbot in 2025 \- Dialzara, accessed March 13, 2026, [https://dialzara.com/blog/7-ethical-guidelines-for-building-trustworthy-ai-chatbots](https://dialzara.com/blog/7-ethical-guidelines-for-building-trustworthy-ai-chatbots)  
7. Mastering Event Delegation for Large Scale JavaScript Applications, accessed March 13, 2026, [https://javascript.plainenglish.io/mastering-event-delegation-for-large-scale-javascript-applications-fd2b52c06afd](https://javascript.plainenglish.io/mastering-event-delegation-for-large-scale-javascript-applications-fd2b52c06afd)  
8. Mastering JavaScript Events: How to Handle User Actions with Ease \- Medium, accessed March 13, 2026, [https://medium.com/@francesco-saviano/mastering-javascript-events-how-to-handle-user-actions-with-ease-9c50f29816b8](https://medium.com/@francesco-saviano/mastering-javascript-events-how-to-handle-user-actions-with-ease-9c50f29816b8)  
9. javascript \- Event Listener or onClick \- Best Practice \- Stack Overflow, accessed March 13, 2026, [https://stackoverflow.com/questions/18426417/event-listener-or-onclick-best-practice](https://stackoverflow.com/questions/18426417/event-listener-or-onclick-best-practice)  
10. Complying with consumer law when using AI agents \- GOV.UK, accessed March 13, 2026, [https://www.gov.uk/government/publications/complying-with-consumer-law-when-using-ai-agents/complying-with-consumer-law-when-using-ai-agents](https://www.gov.uk/government/publications/complying-with-consumer-law-when-using-ai-agents/complying-with-consumer-law-when-using-ai-agents)  
11. What are the best strategies for mastering JavaScript's event handling? : r/learnjavascript, accessed March 13, 2026, [https://www.reddit.com/r/learnjavascript/comments/1pzvmsc/what\_are\_the\_best\_strategies\_for\_mastering/](https://www.reddit.com/r/learnjavascript/comments/1pzvmsc/what_are_the_best_strategies_for_mastering/)  
12. What are the best practices for conducting trauma-informed interviews? \- Dr.Oracle, accessed March 13, 2026, [https://www.droracle.ai/articles/622101/what-are-the-best-practices-for-conducting-trauma-informed-interviews](https://www.droracle.ai/articles/622101/what-are-the-best-practices-for-conducting-trauma-informed-interviews)  
13. MediaPipe Blendshapes recording and filtering | by Samer Attrah \- Medium, accessed March 13, 2026, [https://medium.com/@samiratra95/mediapipe-blendshapes-recording-and-filtering-29bd6243924e](https://medium.com/@samiratra95/mediapipe-blendshapes-recording-and-filtering-29bd6243924e)  
14. Can Your Camera Tell if You're Bored in Class? An Introduction to Facial Emotion Recognition using MediaPipe | by Samiksha Patil | Medium, accessed March 13, 2026, [https://medium.com/@samikshapatil486/can-your-camera-tell-if-youre-bored-in-class-bfece6871e58](https://medium.com/@samikshapatil486/can-your-camera-tell-if-youre-bored-in-class-bfece6871e58)  
15. Face landmark detection guide | Google AI Edge, accessed March 13, 2026, [https://ai.google.dev/edge/mediapipe/solutions/vision/face\_landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)  
16. MediaPipe Face Mesh \- GitHub, accessed March 13, 2026, [https://github.com/google-ai-edge/mediapipe/wiki/MediaPipe-Face-Mesh](https://github.com/google-ai-edge/mediapipe/wiki/MediaPipe-Face-Mesh)  
17. layout: forward target: https://developers.google.com/mediapipe/solutions/vision/face\_landmarker/ title: Face Mesh parent: MediaPipe Legacy Solutions nav\_order: 2 — MediaPipe v0.7.5 documentation \- Read the Docs, accessed March 13, 2026, [https://mediapipe.readthedocs.io/en/latest/solutions/face\_mesh.html](https://mediapipe.readthedocs.io/en/latest/solutions/face_mesh.html)  
18. Deep Learning-Based Real-Time Sequential Facial Expression Analysis Using Geometric Features \- arXiv.org, accessed March 13, 2026, [https://arxiv.org/html/2512.05669v1](https://arxiv.org/html/2512.05669v1)  
19. \[2309.05782\] Blendshapes GHUM: Real-time Monocular Facial Blendshape Prediction, accessed March 13, 2026, [https://ar5iv.labs.arxiv.org/html/2309.05782](https://ar5iv.labs.arxiv.org/html/2309.05782)  
20. py-feat/mp\_blendshapes \- Hugging Face, accessed March 13, 2026, [https://huggingface.co/py-feat/mp\_blendshapes](https://huggingface.co/py-feat/mp_blendshapes)  
21. Defining Emotions Using Auction Point via Mediapipe\! | by CToraq \- Stackademic, accessed March 13, 2026, [https://blog.stackademic.com/defining-emotions-using-auction-point-via-mediapipe-c1aec5db1991](https://blog.stackademic.com/defining-emotions-using-auction-point-via-mediapipe-c1aec5db1991)  
22. Legislative Snapshot: Suicide Prevention Infrastructure and AI Chatbots \- ASTHO, accessed March 13, 2026, [https://www.astho.org/communications/blog/2026/legislative-snapshot-suicide-prevention-infrastructure-and-ai-chatbots/](https://www.astho.org/communications/blog/2026/legislative-snapshot-suicide-prevention-infrastructure-and-ai-chatbots/)  
23. QUESTION 5: How should these tools be deployed or limited in high-risk or vulnerable populations? \- AI and Mental Health Care: Issues, Challenges, and Opportunities | American Academy of Arts and Sciences, accessed March 13, 2026, [https://www.amacad.org/publication/artificial-intelligence-ai-mental-health-care-issues/section/8](https://www.amacad.org/publication/artificial-intelligence-ai-mental-health-care-issues/section/8)  
24. The US Needs a New Suicide Prevention Plan That Tackles Social Media and AI, accessed March 13, 2026, [https://www.techpolicy.press/the-us-needs-a-new-suicide-prevention-plan-that-tackles-social-media-and-ai/](https://www.techpolicy.press/the-us-needs-a-new-suicide-prevention-plan-that-tackles-social-media-and-ai/)  
25. Helping people when they need it most | OpenAI, accessed March 13, 2026, [https://openai.com/index/helping-people-when-they-need-it-most/](https://openai.com/index/helping-people-when-they-need-it-most/)  
26. Using "Prompt Engineering" for Safer AI Mental Health Use | Psychology Today, accessed March 13, 2026, [https://www.psychologytoday.com/us/blog/experimentations/202507/using-prompt-engineering-for-safer-ai-mental-health-use](https://www.psychologytoday.com/us/blog/experimentations/202507/using-prompt-engineering-for-safer-ai-mental-health-use)  
27. Evaluating LLMs for Suicide Risk Detection: Can AI Catch a Cry for Help? — EA Forum, accessed March 13, 2026, [https://forum.effectivealtruism.org/posts/CKykK8LWdqGsJuTK8/evaluating-llms-for-suicide-risk-detection-can-ai-catch-a-1](https://forum.effectivealtruism.org/posts/CKykK8LWdqGsJuTK8/evaluating-llms-for-suicide-risk-detection-can-ai-catch-a-1)  
28. Masked Face Emotion Recognition Based on Facial Landmarks and Deep Learning Approaches for Visually Impaired People \- PMC, accessed March 13, 2026, [https://pmc.ncbi.nlm.nih.gov/articles/PMC9921901/](https://pmc.ncbi.nlm.nih.gov/articles/PMC9921901/)  
29. Federal and State Regulators Target AI Chatbots and Intimate Imagery, accessed March 13, 2026, [https://www.crowell.com/en/insights/client-alerts/federal-and-state-regulators-target-ai-chatbots-and-intimate-imagery](https://www.crowell.com/en/insights/client-alerts/federal-and-state-regulators-target-ai-chatbots-and-intimate-imagery)  
30. New York's Safeguards for AI Companions Are Now in Effect, accessed March 13, 2026, [https://www.manatt.com/insights/newsletters/client-alert/new-york-s-safeguards-for-ai-companions-are-now-in-effect](https://www.manatt.com/insights/newsletters/client-alert/new-york-s-safeguards-for-ai-companions-are-now-in-effect)  
31. California and New York launch AI companion safety laws \- Davis Polk, accessed March 13, 2026, [https://www.davispolk.com/insights/client-update/california-and-new-york-launch-ai-companion-safety-laws](https://www.davispolk.com/insights/client-update/california-and-new-york-launch-ai-companion-safety-laws)  
32. Mitigating Suicide Risk for Minors Involving AI Chatbots—A First in the Nation Law \- Harvard Business School, accessed March 13, 2026, [https://www.hbs.edu/ris/download.aspx?name=Mitigating+suicide+risk+for+minors.pdf](https://www.hbs.edu/ris/download.aspx?name=Mitigating+suicide+risk+for+minors.pdf)  
33. How Businesses Can Prepare for Regulations on Artificial Intelligence Companions | Knobbe Martens \- JDSupra, accessed March 13, 2026, [https://www.jdsupra.com/legalnews/how-businesses-can-prepare-for-1060342/](https://www.jdsupra.com/legalnews/how-businesses-can-prepare-for-1060342/)  
34. Online Safety Act: explainer \- GOV.UK, accessed March 13, 2026, [https://www.gov.uk/government/publications/online-safety-act-explainer/online-safety-act-explainer](https://www.gov.uk/government/publications/online-safety-act-explainer/online-safety-act-explainer)  
35. The Child Sexual Exploitation & Abuse Industry Reporting Portal \- National Crime Agency, accessed March 13, 2026, [https://www.nationalcrimeagency.gov.uk/what-we-do/crime-threats/child-sexual-abuse-and-exploitation/the-child-sexual-exploitation-abuse-industry-reporting-portal](https://www.nationalcrimeagency.gov.uk/what-we-do/crime-threats/child-sexual-abuse-and-exploitation/the-child-sexual-exploitation-abuse-industry-reporting-portal)  
36. Duties to report child abuse in England \- House of Commons Library, accessed March 13, 2026, [https://commonslibrary.parliament.uk/research-briefings/sn06793/](https://commonslibrary.parliament.uk/research-briefings/sn06793/)  
37. Mandatory reporting of child sexual abuse in England \- NSPCC Learning, accessed March 13, 2026, [https://learning.nspcc.org.uk/news/2025/september/mandatory-reporting-child-sexual-abuse-england](https://learning.nspcc.org.uk/news/2025/september/mandatory-reporting-child-sexual-abuse-england)  
38. Duties to report child abuse in England \- UK Parliament, accessed March 13, 2026, [https://researchbriefings.files.parliament.uk/documents/SN06793/SN06793.pdf](https://researchbriefings.files.parliament.uk/documents/SN06793/SN06793.pdf)  
39. Meta's AI sending 'junk' tips to DoJ, US child abuse investigators say \- The Guardian, accessed March 13, 2026, [https://www.theguardian.com/technology/2026/feb/25/meta-ai-junk-child-abuse-tips-doj](https://www.theguardian.com/technology/2026/feb/25/meta-ai-junk-child-abuse-tips-doj)  
40. New Minor Safety Obligations for Online Services: REPORT Act Expands Child Sexual Exploitation Reporting Requirements | Wilson Sonsini Goodrich & Rosati \- JDSupra, accessed March 13, 2026, [https://www.jdsupra.com/legalnews/new-minor-safety-obligations-for-online-6576964/](https://www.jdsupra.com/legalnews/new-minor-safety-obligations-for-online-6576964/)  
41. The REPORT Act: The 2024 Law on Child Exploitation Reporting \- Warrant Builder, accessed March 13, 2026, [https://warrantbuilder.com/report\_act/](https://warrantbuilder.com/report_act/)  
42. PROTECT Our Children Reauthorization Act of 2025 \- RAINN, accessed March 13, 2026, [https://rainn.org/federal-legislation/protect-our-children-reauthorization-act-of-2025/](https://rainn.org/federal-legislation/protect-our-children-reauthorization-act-of-2025/)  
43. How Rules for Publicly Available Data Are Shaping the Future of AI, accessed March 13, 2026, [https://itif.org/publications/2026/03/13/how-rules-for-publicly-available-data-are-shaping-the-future-of-ai/](https://itif.org/publications/2026/03/13/how-rules-for-publicly-available-data-are-shaping-the-future-of-ai/)  
44. A Survivor's Right to Privacy When Reporting Sexual Harm Facilitated by Apps \- RALIANCE, accessed March 13, 2026, [https://www.raliance.org/exploring-a-survivors-right-to-privacy-when-reporting-sexual-harm-facilitated-by-apps/](https://www.raliance.org/exploring-a-survivors-right-to-privacy-when-reporting-sexual-harm-facilitated-by-apps/)  
45. Balancing Safety and Privacy: Regulatory Models for AI Misuse \- Institute for Law & AI, accessed March 13, 2026, [https://law-ai.org/balancing-safety-and-privacy-regulatory-models-for-ai-misuse/](https://law-ai.org/balancing-safety-and-privacy-regulatory-models-for-ai-misuse/)  
46. The Complete Guide to Local-First AI: WebGPU, Wasm, and Chrome's Built-in Model, accessed March 13, 2026, [https://www.sitepoint.com/local-first-ai-webgpu-chrome-guide/](https://www.sitepoint.com/local-first-ai-webgpu-chrome-guide/)  
47. Reporting by Online Platforms \- Briefly, accessed March 13, 2026, [https://www.globalchildexploitationpolicy.org/content/gpp-ncmec/us/en/policy-advocacy/reporting-by-online-platforms.html](https://www.globalchildexploitationpolicy.org/content/gpp-ncmec/us/en/policy-advocacy/reporting-by-online-platforms.html)  
48. How the EU is fighting child sexual abuse online | Topics | European Parliament, accessed March 13, 2026, [https://www.europarl.europa.eu/topics/en/article/20231116STO11629/how-the-eu-is-fighting-child-sexual-abuse-online](https://www.europarl.europa.eu/topics/en/article/20231116STO11629/how-the-eu-is-fighting-child-sexual-abuse-online)  
49. Online platforms face new EU duties on child protection | Digital Watch Observatory, accessed March 13, 2026, [https://dig.watch/updates/online-platforms-face-new-eu-duties-on-child-protection](https://dig.watch/updates/online-platforms-face-new-eu-duties-on-child-protection)  
50. Strong public support for EU child sexual abuse legislation as abuse imagery rockets \- IWF, accessed March 13, 2026, [https://www.iwf.org.uk/news-media/news/strong-public-support-for-eu-child-sexual-abuse-legislation-as-abuse-imagery-rockets/](https://www.iwf.org.uk/news-media/news/strong-public-support-for-eu-child-sexual-abuse-legislation-as-abuse-imagery-rockets/)  
51. Providing a Trauma-Informed Response to Disclosures of Violence, accessed March 13, 2026, [https://transformation.ucsd.edu/\_files/CARE---TI-Response-to-Disclosures-of-Violence.pdf](https://transformation.ucsd.edu/_files/CARE---TI-Response-to-Disclosures-of-Violence.pdf)  
52. Interviewing survivors and other sources: best practices \- Our Watch, accessed March 13, 2026, [https://www.ourwatch.org.au/media-reporting/resources/interviewing-survivors](https://www.ourwatch.org.au/media-reporting/resources/interviewing-survivors)  
53. 32 CFR Part 103 \-- Sexual Assault Prevention and Response (SAPR) Program \- eCFR, accessed March 13, 2026, [https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-D/part-103](https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-D/part-103)  
54. A Trauma-Informed Response to Sexual Violence and Harassment, accessed March 13, 2026, [https://cupe.ca/trauma-informed-response-sexual-violence-and-harassment](https://cupe.ca/trauma-informed-response-sexual-violence-and-harassment)  
55. Trauma-Informed Approach to Interviewing a Victim of Assault, Abuse, or Violence \- OSAA, accessed March 13, 2026, [https://www.osaa.org/docs/equity/BiasIncidentTraumaInformedApproachtoInterviewingVictims.pdf](https://www.osaa.org/docs/equity/BiasIncidentTraumaInformedApproachtoInterviewingVictims.pdf)  
56. Trauma-Informed Interviewing and the Criminal Sexual Assault Case: Where Investigative Technique Meets Evidentiary Value \- EVAWI, accessed March 13, 2026, [https://evawintl.org/resource\_library/evawi-training-bulletin-trauma-informed-interviewing-and-the-criminal-sexual-assault-case-where-investigative-technique-meets-evidentiary-value/](https://evawintl.org/resource_library/evawi-training-bulletin-trauma-informed-interviewing-and-the-criminal-sexual-assault-case-where-investigative-technique-meets-evidentiary-value/)  
57. NH PFWVC Trauma Informed, accessed March 13, 2026, [https://www.doj.nh.gov/sites/g/files/ehbemt721/files/inline-documents/sonh/27.-first-do-no-harm-trauma-informed-interviewing-jon-kurland.pdf](https://www.doj.nh.gov/sites/g/files/ehbemt721/files/inline-documents/sonh/27.-first-do-no-harm-trauma-informed-interviewing-jon-kurland.pdf)  
58. Responding to Sexual Violence: A Guide for Professionals in the Commonwealth \- KASAP, accessed March 13, 2026, [https://www.kasap.org/proguide/](https://www.kasap.org/proguide/)  
59. Compassionate Response to Disclosure: Advice for Supporting a Victim of Sexual Assault, accessed March 13, 2026, [https://www.sakitta.org/toolkit/docs/Compassionate-Response-to-Disclosure-Advice-for-Supporting-a-Victim-of-Sexual-Assault.pdf](https://www.sakitta.org/toolkit/docs/Compassionate-Response-to-Disclosure-Advice-for-Supporting-a-Victim-of-Sexual-Assault.pdf)  
60. Trauma narratives: recommendations for investigative interviewing \- PMC \- NIH, accessed March 13, 2026, [https://pmc.ncbi.nlm.nih.gov/articles/PMC7901695/](https://pmc.ncbi.nlm.nih.gov/articles/PMC7901695/)  
61. Adult Sexual Assault: A Trauma Informed Approach \- Tom Tremblay Consulting, accessed March 13, 2026, [https://www.tomtremblayconsulting.com/app/download/8446071/Facilitator%27s+Guide-A+Trauma+Informed+Response+to+Sexual+Assault.pdf](https://www.tomtremblayconsulting.com/app/download/8446071/Facilitator%27s+Guide-A+Trauma+Informed+Response+to+Sexual+Assault.pdf)  
62. Interviewing Skills \- SAKI Toolkit \- Sexual Assault Kit Initiative, accessed March 13, 2026, [https://www.sakitta.org/toolkit/index.cfm?fuseaction=topic\&topic=10](https://www.sakitta.org/toolkit/index.cfm?fuseaction=topic&topic=10)  
63. Issue 32: Trauma- and Violence-Informed Interview Strategies in Work with Survivors of Gender-Based Violence \- Learning Network \- Western University, accessed March 13, 2026, [https://www.gbvlearningnetwork.ca/our-work/issuebased\_newsletters/issue-32/index.html](https://www.gbvlearningnetwork.ca/our-work/issuebased_newsletters/issue-32/index.html)  
64. New study: AI chatbots systematically violate mental health ethics standards, accessed March 13, 2026, [https://www.brown.edu/news/2025-10-21/ai-mental-health-ethics](https://www.brown.edu/news/2025-10-21/ai-mental-health-ethics)  
65. Optimize long tasks | Articles \- web.dev, accessed March 13, 2026, [https://web.dev/articles/optimize-long-tasks](https://web.dev/articles/optimize-long-tasks)  
66. Inside the Web AI Revolution: On-Device ML, WebGPU, and Real-World Deployments | by Nil Seri, accessed March 13, 2026, [https://senoritadeveloper.medium.com/inside-the-web-ai-revolution-on-device-ml-webgpu-and-real-world-deployments-c34abbf22fdb](https://senoritadeveloper.medium.com/inside-the-web-ai-revolution-on-device-ml-webgpu-and-real-world-deployments-c34abbf22fdb)  
67. The Definitive Guide to Local-First AI: Building Privacy-Centric Web Apps in 2026 \- SitePoint, accessed March 13, 2026, [https://www.sitepoint.com/definitive-guide-local-first-ai-2026/](https://www.sitepoint.com/definitive-guide-local-first-ai-2026/)  
68. Building a Private AI Translator with WebGPU and Transformers.js | by Maurizio Farina | Software as a Post | Feb, 2026 | Medium, accessed March 13, 2026, [https://medium.com/software-as-a-post/building-a-private-ai-translator-with-webgpu-and-transformers-js-2cb060f1df2c](https://medium.com/software-as-a-post/building-a-private-ai-translator-with-webgpu-and-transformers-js-2cb060f1df2c)  
69. Face landmark detection guide for Web | Google AI Edge, accessed March 13, 2026, [https://ai.google.dev/edge/mediapipe/solutions/vision/face\_landmarker/web\_js](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)  
70. Transformers.js \- Hugging Face, accessed March 13, 2026, [https://huggingface.co/docs/transformers.js/index](https://huggingface.co/docs/transformers.js/index)  
71. Voice AI Integration: From Silent Pixels to Conversational UI with Whisper \- DEV Community, accessed March 13, 2026, [https://dev.to/programmingcentral/voice-ai-integration-from-silent-pixels-to-conversational-ui-with-whisper-3ii8](https://dev.to/programmingcentral/voice-ai-integration-from-silent-pixels-to-conversational-ui-with-whisper-3ii8)  
72. Offline speech recognition with Whisper: Browser \+ Node.js implementations \- AssemblyAI, accessed March 13, 2026, [https://www.assemblyai.com/blog/offline-speech-recognition-whisper-browser-node-js](https://www.assemblyai.com/blog/offline-speech-recognition-whisper-browser-node-js)  
73. Build a voice agent with LangChain, accessed March 13, 2026, [https://docs.langchain.com/oss/python/langchain/voice-agent](https://docs.langchain.com/oss/python/langchain/voice-agent)  
74. The voice AI stack for building agents in 2026 \- AssemblyAI, accessed March 13, 2026, [https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents](https://www.assemblyai.com/blog/the-voice-ai-stack-for-building-agents)  
75. A Lightweight Modular Framework for Constructing Autonomous Agents Driven by Large Language Models: Design, Implementation, and Applications in AgentForge This work is submitted for review to IEEE Access. \- arXiv, accessed March 13, 2026, [https://arxiv.org/html/2601.13383v1](https://arxiv.org/html/2601.13383v1)  
76. Building a modular real-time voice agent (10 concurrent users) – looking for STT/TTS recs \+ architecture sanity check : r/LocalLLaMA \- Reddit, accessed March 13, 2026, [https://www.reddit.com/r/LocalLLaMA/comments/1ro9j86/building\_a\_modular\_realtime\_voice\_agent\_10/](https://www.reddit.com/r/LocalLLaMA/comments/1ro9j86/building_a_modular_realtime_voice_agent_10/)  
77. RTX5080 for local AI/ML : r/ollama \- Reddit, accessed March 13, 2026, [https://www.reddit.com/r/ollama/comments/1jhoom8/rtx5080\_for\_local\_aiml/](https://www.reddit.com/r/ollama/comments/1jhoom8/rtx5080_for_local_aiml/)  
78. NVIDIA GeForce RTX 5090 & 5080 AI Review \- Puget Systems, accessed March 13, 2026, [https://www.pugetsystems.com/labs/articles/nvidia-geforce-rtx-5090-amp-5080-ai-review/](https://www.pugetsystems.com/labs/articles/nvidia-geforce-rtx-5090-amp-5080-ai-review/)  
79. The Best GPUs for Local LLM Inference in 2025, accessed March 13, 2026, [https://localllm.in/blog/best-gpus-llm-inference-2025](https://localllm.in/blog/best-gpus-llm-inference-2025)  
80. NVIDIA GeForce RTX 5080 Review: The Sweet Spot for AI Workloads \- StorageReview.com, accessed March 13, 2026, [https://www.storagereview.com/review/nvidia-geforce-rtx-5080-review-the-sweet-spot-for-ai-workloads](https://www.storagereview.com/review/nvidia-geforce-rtx-5080-review-the-sweet-spot-for-ai-workloads)  
81. Benchmarking AI on an RTX 5080: How Well Do Popular LLMs Run? \- Micro Center, accessed March 13, 2026, [https://www.microcenter.com/site/mc-news/article/benchmarking-ai-on-nvidia-5080.aspx](https://www.microcenter.com/site/mc-news/article/benchmarking-ai-on-nvidia-5080.aspx)  
82. NVIDIA GeForce RTX 5080 \- LocalScore \- Local AI Benchmark, accessed March 13, 2026, [https://www.localscore.ai/accelerator/489](https://www.localscore.ai/accelerator/489)  
83. Local AI Privacy Guide: Secure Data Protection 2025, accessed March 13, 2026, [https://localaimaster.com/blog/local-ai-privacy-guide](https://localaimaster.com/blog/local-ai-privacy-guide)  
84. Disclosure, Humanizing, and Contextual Vulnerability of Generative AI Chatbots \- Harvard Business School, accessed March 13, 2026, [https://www.hbs.edu/ris/Publication%20Files/Disclosure,%20humanizing,%20and%20Contextual%20Vulnerability%20(Published)\_762b6259-ca7f-422f-b705-3172f0006f40.pdf](https://www.hbs.edu/ris/Publication%20Files/Disclosure,%20humanizing,%20and%20Contextual%20Vulnerability%20\(Published\)_762b6259-ca7f-422f-b705-3172f0006f40.pdf)  
85. Governing AI in Mental Health: 50-State Legislative Review \- PMC, accessed March 13, 2026, [https://pmc.ncbi.nlm.nih.gov/articles/PMC12578431/](https://pmc.ncbi.nlm.nih.gov/articles/PMC12578431/)  
86. AI Companions and Suicide Prevention: The New Legal Mandate You Can't Ignore, accessed March 13, 2026, [https://www.essendgroup.com/post/ai-companions-and-suicide-prevention-the-new-legal-mandate-you-can-t-ignore](https://www.essendgroup.com/post/ai-companions-and-suicide-prevention-the-new-legal-mandate-you-can-t-ignore)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAZCAYAAABzVH1EAAACp0lEQVR4Xu2WTchNURSGl1DkPyJJPjIhRSSRkSQDzERRBpIJEwM/ZSbJ3EgkI4qJ5GdgcKMkpmQgdUmUkggTv+9z19nfXWffe87tfmR03nrqnr3X2nevtdc6Z5s1atRoWI0TS/PBIObnivVifDYXNVGsFjPziSF1TLwWb8XXbK6v2OBycUO0y1OjGhEPxVNxXrwQq6KB+TrbxAdx0Xytq2JGsBlG68Rh8yBeZnM9IntTxRpzh1fl6Y4OiV9icxhbZr7hc+YBTBZ3xTMxJ9gdNPcdq/D/LY7kE1WqC6Rlvmk2nzTf3DZtPPnfEpOC3XbzjYxFJOiS+C42ZnOVqgvknfk4m0/iFFvmPvjuMd/w5WCD0rrYR/V7jglAJIhEUVbzzPsz9+tRXSBpvF8gbJ6s05h1gSRfSvmM+CLOignFODaPrNxPyfemOC7eiB82oO/qAmGDgwIhgEGBkOE7YrF4buV+OmXdzCdRVqx5wrzMUCpVEtdXfxvIheJ3XSAj4oD5KWB7umvWWSPvLwJtiwVhDB98d4SxkuoC+ZelhQgkb2B6LAaG8Ltu3fJL/0nPLinGelQXSL9mnyYeiG9irVU3O3PYYJ9Ehp+IWWGM707+ZmK9+NpdIT5a78mVVBcIf/pZrAxj6fXbNt8YmyDL98SUrtloTacaR3yPKMWoa1ZuYOzzU0unTtLQojDXEU5bzR3fF89RXFu4JtB8vHUQDUjgfH2T9oqfYlfxzMbuF0TxPWKt9D8brPe1StJiWSES1xLTxdEw3hGZJcqclpUX32Qe5BWx27xcdlo5aII8KT6ZZ+2x+ZUmv7/hg3/L/Fp0uzTr4iT3Z2PcItgDb778RIcSJbNF7Ct+V2mheSCUa9XlkhonibOttwIQScl9scO+yqdRo0aNGv0//QHNiLCo50ZflwAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAZCAYAAABzVH1EAAADBUlEQVR4Xu2WW6hNURSGf6HI/RK55RJKyQMhEVKUoiTlAYUXRXmgiLx64gFREsmDyDW5hnRQkmdSIkcpUYgil1z+/4w59hpr2Xuf42HvOrX++mrNucaaa8w5LmsBpUqV+h/1J3PIhOKNoO6w+7LrUrgXJbupsDWbqjPkGTlGWsga5B3V9RLylrwmH8hzMi/YSG73HrZWKzlN+gWbhmkWGVaY201uk15pfINcJxMrFsBB8ifd65nQ9RMyONhtIL/DuGFaSiYX5rbDItM7jV/BnD7hBtTyNKfTn0SmkS/kKukR7LS+7BquxeQpmRLmdLL7kKXXZZgzWysWmYNyXptYlcZxs5Jv0A9F6gqrI5eu4zhKzw1C5ovqLq5V0RCYA+IAGUgeIp9uenGfMJaUMnqmlYyARbHeRnw9OXWTvCMzyVryknwmG5GvzWvIavIBOZnGH5E/1IrWk6/INnQIWX3UkvJedeSFrA20t5EB5BIZR36Si8gi4XZH01gH41LNqfZ0YFuQ1WZOKtJ7ZDhZAOtGMjyC2uGeASv+2I3kQHsbGUU2wWpItoqqy1O1BbbuunDP1+gG83cu6Rvut0khGhPGioQW/EXmh3nXaFirLkaso6klySFlwPQwtxPVn5c8jWvKQ1bUNtiDMbySTuoW2ZvGcmg2rK5qFbucldOxxvy9sU2r2xWjJKlmjsNSsaZ0SmqtRY2EFVXciEKqdNsBK35JOX8BZq+vvV4Wvz+Sp0wsYtmqcOPcG9g7x6axOpPe45t+keYltfuFYdym1WQl8osq3/W19xrxCFXjHCwyktZSSmo9SRFU/QmXbPVMXF81F2vS01FN4TCssegZ+ai1r6BKC9auv5H7ZDPZj39/KxS14gYctWyXHNlFPsFS7RF5TMYHGz/h8+QuOQv79YmNRU7KWd3fQ5bBPrx3yClYKleVnF4Ee/kK1P8h7IjUnbSWTtbT0OUpKMf1TRmarovSc/GnU52u6T+h9eTfgU4r9X6l0Q/yHZbGXludSuo0SltHvyelSpVqgv4CAEi1QgR8YvsAAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAZCAYAAADJ9/UkAAAB7ElEQVR4Xu2VzysFURTHj1Dkd0RSlGysJCksZEGRKD/Kwh+gLG0sLKwsbO0ldiQskIUkrCg2SinFAlESRdjw/b5775s7d94IvVl53/o0c8+9M/ecc8+ZEUnpv6sQtIBKkOnMRaolcAlmwTp48M1GqE4w4thKwBbIduxJVRqYA+2OPVdU9LWOPakqAkegwZ2APkGPNS4GWdY43RnbYs2UWmOu4/MMNq5ycCXhm4/re6b/BLyCAdABzsEzmBavQHmdANfgBnSDUVF73INNvS4mbvqir67M5hlgAVSDW3AsKgrKOL8NcsCaqCMz4jt6QZ0oRx+tubjxu83zwRjo0rYZa41xng7QEa4xohN0lk4z3dyrxpr/cdqpKW3rt2y8p21X/BFTLFaTkYQKKzh66m60IcEOYBbcbBgx3XQ4VDzPZfGni2IUbi0whfsgz7LR8XfQrMdl4nUAHXKPYdgax8Ti2QMFlm1IY4sRHopXbFWi0mqe48s/RLUnO+JN1HlTPOsDUK/HPp2BHVGeMVVsKfaxEaNhpc6Lajle7yR4nhdgRVQNNIFTsCiqQxq9ZX6xP1tFbd4nXnRGjIApZo3wB8RCTfSB4Rw/LsZx3tvjP4lnl6ioIhUrm3+6J7AKJiXYUpGpAgxatInqkJRS+rW+AGylXce81sPnAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB0AAAAXCAYAAAD3CERpAAACBUlEQVR4Xu2UP0hWYRTGH1FBSVIQQiFSIgUJXKQt/wwOCtmQQ0KRQ0O6NAmig3sgCuHgIIiCGCTukdg3RYRDQyREDQUpDglFOiiUz/Od972ervcuOfY98OP73nPP+54/77kXKOl/0sO0IaUa0kIq0w+CZL9J6tIP8tRMltLGoAayTn6RAnlHmtzzMnKL7MHO0O8L2L5cKcNFZAfV4R/JCrlI+skPsuB8OskWuRbW1bDnbxOPlHToBhnD2aB3yG/y1NlayQxpD2u1vEDmYBVHNZIvbp1IFc6T+2QAZ4OukT+w4Hm6AEtaflPO3ke+uXWiQbIMC54V9DM5hh0wS3bIKrnsnagRWFDRTdrIBzLqnaJekevhf1bQA3JIXpO7sPZtwu7YD5KSnsZpYA3cbfzd7qIqYBlG5QXVIf6+9EqoelWsM6KuwBKKgb/Cqk50ibz0BmQH/QkbpF5niwOig7VHrd4mEzhNTME+BZ+qYCs6H8Gyiew72zPYgOhO1d4btq2odNBHZJdcdT6S2q9rkH9Riq6F5wF5Hv7Xw7KO06vDozQk32EtVqvHYUkkhztNItueKKu9Q7CgqiZKVav6N6Q2+OgaOpyPpKSfwLXXS4Hi5UcKsJdeUmW6s/ewzBVQXfGT2QybcH2pHsP2qxv6ev2z9Ep0kWFY67NUDkvwHulBToUllXQunQCTt3JZqCq92QAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB0AAAAXCAYAAAD3CERpAAABv0lEQVR4Xu2UPyhFYRjGH6GIQSlR4iaLjJIUMRgQFosiiwElFhGDXRkMBknEpGQ0iFCKkpmShUgGiliUP8973++c893vnIsY3ad+3fO+9z3f873fnwOk9J/U58QxMkKynXwyZZI6kuf+kUwxsuLkWsgHeSPX5MrhwNSlkTZyBx1DfrdIofk/UjLDZYRN+6GmyVgwdfXkhJSbWFZmkRybOKRSskNGETZdItVOrpgckRoT55J9Mgft2FMRubRiX9LhPOkh7Qibyh67+yP1YwgMcqCTls6nvCKqmdxYsa9Osgo1jzKN0gbCB2sAwZI3kApySgbtIk97pNI8/8RU9qzWTUInPYPA+Jl0IHG548qAztDTd6YywCx0D6NUQnYRGMvplq59FZBtO4HvTYegg7mSg3VGJhB0JmYX0Posk4sbvCLxzj1YuTXoAfEkL24i2lSu1S0pc/JyK86hpzguGUQCm16ybp7zkbgf0o18HF6snKdx6NXwB7c0iei8r6+WtwpqGGXaRZ6gNbZk0tOwlteWGHmb77GPxAPTRN6hg0cpRg7JIxmGvn8P/Yz+WnIlWhHuxlY69H52k0Yk6TCllP6kT8ocYuPqX1C7AAAAAElFTkSuQmCC>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAZCAYAAAAIcL+IAAAAkElEQVR4XmNgGAW0AIxALATErEhivEhsOLgOxP+B+AoQqzBANFZAaTgwRBNwA+IzSHyswACIdwKxPLoEMnAB4h1ALIMugQy8gXgVA8RDOAHIfXOAmBtNTBKJz2AGxM+B+AcQPwXilUB8Goh/ISsSA+L9DBDFIE88YoAE0TcgjkVSBw5cfiQ+BwPEOhA9CogDAIEOEq87fQxPAAAAAElFTkSuQmCC>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAYCAYAAAAYl8YPAAABbUlEQVR4Xu2UsSuFURjGH7mKrjIYMIlZFmUgZWCSW1IWi+lOFqk7WuQfMFAiGWSRLDZ/gD9AWW6RbAYpFgOe53ud23vO+Swmw33qd7973vf93vOe857zAW39VR2kMzVS/amB6iWTZOznfyYZ38glOSBH5JbUfBDVQ17II/kgX+QiioAlk8PzCqs4qEL2YQklPQ9hsX0hSFIyVSR2ySKp+gDYsp4S+wC5I+vOViSb8IYSaQJVoWeQKj8lV6Q7GMOmLpA9WHVTwenUesGNlegYbkuU7IFskWGyQp6RLzWVlq6GzHijki17A7VGthE3wasLVpGW/ltMS9pDbfhI6oC93CCfZDPxlWoUFjyXOmCreIdVH1WlwQapeyM1hLx7khp1D2tW0DTsHBY/Z2TcOSVVdIP4QKo5uhWayLPjYjBPBt1Yp/sc8XVS0mvkN0WsurhiqdrsE9i9bCK/TuHQlpHtq74QS7BZZpEf0Lb+u74BuLxDBoQs9poAAAAASUVORK5CYII=>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAXCAYAAAAyet74AAAAvklEQVR4XmNgGHpABojtgVgSiJnR5ODAFIifAfErIP4PxB+BOBxFBRAYAvEtJL4VEL8H4r9IYgw8QHyAAWIKiA0DIBu+AbELTIARiCcwQBSywASBwBiIvwKxL5IYWDEvsgADxKR/DBANOAFI4xQGiC2saHIowJwBYi2yB1EAPxDvAeJDQCyBJocCZgHxagaIBhiQRmKDASgmQAo5kcRAoQAKJjgAOb4MiOUYINEHw3pArARThBzg2DAHTOHIAwCfyB9XJiuUiAAAAABJRU5ErkJggg==>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACcAAAAXCAYAAACI2VaYAAACwUlEQVR4Xu2VS8hNURTHl1CEPPOIcgkl8kwiGSEGlMdAeZWJiUyEyOBOzFEmoi9KnjOUgcEXJTEw8SgmH4kklCKSx/9319rn7nPO504N3H/9u3et8z97rb3XWvuYddHFv8UocZE4WRxceZYwQBxvrhtYeZZjiDhbHF59UAExZ9rf47VwRfwknhMfiS/Kj1toiPfEl+a6B+KsXGCe8D7xq3hD/CwesHrwMeYxn4u95rod5psvYaS5aGrYCA6LCwuFA81tcz3oEZ+JUwqF2UHxh7g57KXmgfcXCk/0snmMdPrLxY/i9iQCo8WH4rbcKUwS+8xLDKabB12RBMJi8Yv5zlP5fovXxEFhA04Z/4aw15tXaW6hcBwyX6sASVAmXqj6f4mrwk6J8JuQfB/M+wuQBMnkSMmdDHtd2Jz6vPANFW+Jx8NuoVNyLLAp7E7J0V9LwtcpuQthM1CPwwfpv6Z43zxugVTWPbnTvI94kaMGlDU/SUBCJIYubY7/N82nFdC/JIW/N3xggfgq/Kx73XxyayCBIxXfWisnRw/lJwn2hi9PjpO8K44Ie4J5+arJMQi7rb05eEoclmkKXDQXspsn5gPCC/RHQkO8Yz596NDwH84PDUFJGt8b802fN1/rTGiYXK6qRtgkRD+i+Rm+GijFWPNSUPu80XMwmZQg9RybGVdSeJLJl3qO1sGH/lg8SyAm1xC6EpiUGRUf/cRp5lcCp5g3LCVmsWbm4wS5btL9RXkp82txmrUHMLVLDvocXQmUp7r7prg6s0G12Un+vTinUJi9tfLgLBO/m18RnA4XOFPZE3YOPmO15HiB3Z0Wr5r33tGSwvHU/JOEjt+dVg9AafrEs0G+KBNzgbU/cd/M454Q34mXrP31KWGl+QluNO+7/kDjrhF3xW9/IFm+t1vN16smn4NEWGeL+XB00nbRxf+NP404ogMRdvggAAAAAElFTkSuQmCC>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAWCAYAAAA1vze2AAABB0lEQVR4Xu3UMUsCcRjH8X+gEKg4SotCmGBTIDX1AmrQqRcQtLi3ufoeXLTByblBcGgIampuaLSW0MGtqaG+D+fp3x96cdwU+oUPnM9f7gG507ld/6E9lHUY0Q1Odbgpu/kx7jFePdpYBg/4wQwforn8qnNpZFHDF979w4iqeME1rnCEAxQxWn5ttbhLztF1wa/gd4s7mS2Ku+QElzI7wzNKMl8Ud4nWxgApPfBLumSChg61pEs+cahDLcmSAp6Q0wMtyZIW+jpcV9SSPDouuJFdazb/c4k96xf4xnT+2a/ugjfb2LVf+OZHLrG3NLyB79EF/wSWPfeveENlPgvbxxA9me/a5n4B70I5Ff7A4ykAAAAASUVORK5CYII=>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB0AAAAXCAYAAAD3CERpAAACLklEQVR4Xu2VTahOURSGX6GIQuQn4iYlGSEzrp8o8lNMKANDpAwUcgcGZqJMbt26mchAUYyVJGSAMkKJQiRJIhTl532sdb6zz3E/EzN9bz3ds9dee+2911r7u1JP/7smm6Vmdnui0Cgz3awyo1tzpcaaFYqYXXXBvDdnzX1F0Lb6zC3F/LB5adaWDopDbTZvFLH4e8XMLJ3QJPPYzMsxCznAko6HNNXcMDtyHvGN38rKKb/vmQU5Hm/OmDsdD2uKuWt2lUbruXmmOtVHzCMzo3JIcRtAE811M6j6YGiWIt4fhi2lMW0/zLocHzQ/zVUzJ20c4IHZm+MJOY/fsbShDeZVMf7rpizenuPF5m3avplD5pyiF7hhJQ6AD9AXi8xDs6/w6aR3T2lUNAkLSWulTeZz2uG0omal6NpTqn0+ma1qpvu3CDzQspHa9qZscNx8zbnv5rBio1JzzTXVG7/QyK9B580XhQN1eqpYsDHnhxTdS6dXuqTw4VksVNSaZjuq+mZs9iT9xqWtIYw8DRZQ03eKmiC+2x3ODXmvBKQnKNFrM790UjxFniT90xFpq95VJW7N7cfkmFq2mw0tV/gyRyk4bCN4ivI17NyAlE4rbNRrfTGmscr6Vlqj2IiM7DQfzbKGR2TuhFrppU43Fam6qDh5uznIxknFYS6b/YoNCFb69pnb5oM5oPixoDRVbzTUr7jxNkVdu4kfBFK5O79HEv8IuDnxVqtLA/XU0z/pF0xReTO7qzopAAAAAElFTkSuQmCC>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAZCAYAAADJ9/UkAAACA0lEQVR4Xu2VvUtdQRDFj6ig+I0QlQiC2FhJCKJioYUWIlrEdP4HYpVOLKws7CQIASGCdhKINrGyeKiVgjZCgmCRIooBkQSUJIV6jnNX597nV8Rn4zvw496Z3bs7Ozu7F8jqOSuX1JIOUhPZT6ZvZI/8JGfkF8mJ9ciANMEUaU/4h8lXUpXwP6qKSSpC70HN5JR0Od+jSyufJB9InvO/hqW/z/kqSYGzVRfe9sonL5ytfvo+bSvlSDq14mNYEFIh2SInZIB0kx3ym0zAJpP0HCU/YDXUS4bId1g9LUX9blQLbOK6yFZG5kg92SebsFVIOhkaeJkUkUXEt0/Z6ydNsECPXFuaNKFWtO18peQd6YEN9t61KTMKVAEoEPUJUhAKVkErswqgwbXHVAZbwQqpTrRJ47DJ3zif3uVLIb5iqRFXGblV2qtp8gkWhKT0v7zsAXwhh7BBg5SFZDaClG4FfKdGYJOrsIJmYEcuSClcJSXOt0H+krbI1r0QToACSm7DoLMvpOpV9Ek0cIXrJ986ropN9aG0hkxp8H+w46kx/8D2W9Jer5FXkX2hcMkkJxZKc1iFnqrUWdiR0/MA6fu5Sz7DxmyFFe487IT4LP6XtIKQiXJYZV93wahNl0v4Mend2w+S9u66osqoVNkfYX+5BTKG9COVMemovXV0Iv4PyCqre+scK6VhppEuOgUAAAAASUVORK5CYII=>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACcAAAAXCAYAAACI2VaYAAACjklEQVR4Xu2VzctNURTGl1CEfOYjyktSMhCSlJggBhQmSjE0kYkQvYP7J8hQJEoKQ0YM3igDBkYoUpfEQFKKknw8v7v2Omfvfa9raHKfejp3r7Pufp699jp7m40wwv/FHHGDuFScWr0LTBIXmudNrt7lmCauEWfWLyqgOUyvh5viZ/Gq+FR8Vb7uYUx8JL4xz3ssrs4TzA2fEL+Jd8Qv4inrF59nrWbobS8yEmaLL8XlaUx1zorrmwwHOffN88EV8YW4rMkwOy3+EA+m8WZzgyebDP8/84Rm6GG00JwrPhEP50Fhidg1LzlYaS66NRKEjeJXccLa7fst3hanpDGgysT3WavHONdEjx3pZrEmuDcPpvgvcUcahxGegYh9Mu8vgChmcoS5C9bqMc41I45mX3CQOSY4kMbDzNFfm1JsmLnr9m9zxBtEmY/lQfM+IvFMGrOteSUBhjCWC/H7rvnXCugnTBGfsHJbc0303qV4AQycq2K7rTRHD+WVBMdTLDdHJR+Ks9J4kflHE+YAczLONdFj8X3mwA3zKrwVn5k3K4l7spwx8YH510ceOfyG61IORwmmib03N3DNfK5LKQdwlIRm6L1OeQPBVsw33wp6IG/0HHyZHJ7Rc0y+oMhwkxGLnqtbB6AZevQcmgWmi6uqGP3EyvIjgSoySYAtRrSTxaggx03cHmwv20w/rUgx9HZaqRn9i2YBSlqvvmM+QY662Znoo7i2yTD7YOWHs0X8Lp43rxCIlsk1O+JP69fsndis7qJ4y3wF40WG47n5lUQezyPWCga4Ibri5URugsV5grnePWs1Q6++4hpsM1/RfvO+G4QZ4i7xaHoOAma5bw+Zz1ebD2AkNP+mN8IIIwT+AIbzpXdeVBRZAAAAAElFTkSuQmCC>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAYCAYAAAAYl8YPAAABb0lEQVR4Xu2TMS+EQRCGR5BQCIJCuKgUSoRSJ6FQnEhcclfo/AQhIvcblEKhIkSnUNMIhYaGBj2ioOV9zcxnvkVcotDckzy5zO7sfrszeyJ1/koHHIF9sDmZczg+KJrH/G/Zg09wG17Am/z0Bw3wAR7CLXgLd2MCaYfXcMBiLlqGw1mGMgkXROdJDzyX5BZVuBIHwBDcgU0Wt8Ij2J1lKItwyoNO0d3L2bTSK3oN1o+MwhfY4gnGDFz3gIvubDDC8Tc4a/GSxSn8CNczPzsZjxvpF13MTQi//utmhAvSmrEOcTN2uabN0m4yZsu52E+8aXHKl80IO/cK7+GVaEO4eNrma6pZhJ3qEn1HnOQD5RMhvnnKGDyBbT7ARJ4mvqGq6CN1ePVT0YZFWIZSHGD7D0QfJhmHj/L50p0KnA8xP3Bsv7lBHnUD7ovWbjUmGPzbPMM10ducwctchjEhmlAUrdtPFOCcaC6L35ifrvNvvANw0kVdV5H6iwAAAABJRU5ErkJggg==>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAWCAYAAAC7ZX7KAAAB4klEQVR4Xu2VzytEURTHj1CESDIUTYmFFUVJKRsW8mMhRdnY0qxYyN9gI0s/slQWSvmdxcSOhSjZ2CglCynFgvz4fufeN++9O2+uKaMpvU99em/OOfPmzH3n3ScSEvI/qTcDBhWwCRaaCQ+1sBNWwzwjlzUicB6+mQlNDdyED3ALPsIYzPcWgW54Dpf08cqf/j38Qa5aKYzDL19WMSYqPu6JFcEdeKc/F8B1eJ+sUDTrOPNZxdYwG3uHXUZ8Udx6NsZVP3PTCapE/YkGT4xjUqaP6eDIlZhBL7aGb+ELbDPis+LWD+rzeDKr4HUZ7zNi23BOUkeKVMI9OGkmvNgaZrO2hvld5zzuLRC3YeZNyuGG+B/gKBwV++onyEXDhLd9BRbDRnghGTRLctUwYcMHopodNnJpyWXDHaKuvytqTDLC1vAR/IQ9Rpwr49S3wGdJ3XcjonYP7iJB8Jrt+pyjMCPqofsRW8MxUfGgffhJf+YM7kvwPsw48yb98NKIselDUS8qK1FRbyY2Zr526+A1PBb3ljm3ccEpAkPwQ9yHhkduXb3JChfOKmc2aOUn4Imo303BmbEgubc6tMIbeAqnRa3smvg3dzY4BZfhiD6+6rgX3vJVUYsUBOsHxD73ISEhf803x2Z8Qxhzu94AAAAASUVORK5CYII=>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAAZCAYAAABkdu2NAAADAElEQVR4Xu2WS6hOURTHlzwi5J28bwYkFClSTDwGEgMZkDIiJSOl65WZgYwoJakbJYSMlCTuyMRAihhQiCShFAPyWD9rr2t/69vn9N2bgcH51b97z177W+fstdZee4s0NDT8j8yIAwUWqJaqRkWDMkf1SvVRdVs1stXcxmbVmaC9qmGqLtWJgp3xfjNZdVz1LRoyRqiOqe6oLqveqXa3zBAZr7qg+qU6GWwl5on5ZP4P1SHVwmQjOOtVn5L9qlhAhiZ7RwxWjRXLRq+YowgOidwX1ZI0tkFsLmORx6oPYh/fCTekPiDY8DkxGvpD3QLXikWXDxmexojuAdVOn5TxVcxXqYRLvBB778YwDoPEbD3p/wFTt0CcM34wGipg7tHsmaBMkOoP/CnVGSdr+NsVDQkPeNVzH3ULpDwY3y6WMTL0QLVK2j96iNjcdemZfftU9UR1KtkjzO+VcsZXSOvWcNg27Fcq67TYexg7n0/KqVsgL2D8ppgjGKe6r3rvkxJ8EKU8VXVJtVx1Tuz3F6V9gbPFMnhErIHk2iIWyLN9sw2ytF81Nz3jk0ZFn6hsQJ0sMC9RnNLV4vxusYUTDC+5KarVUj4y2HevVdOjQZkmtj+3hfHIPrHq8OAXqVvgW7HxTWHcM+N1z1/viG/EzjCPchV0zrx55awRy25pbzpkjOxXZs6pW6DvQY6GHF+g7x2yQDa4LKxUPZfyMeL4O6uaF9WA/9HRkBgjdubGPlCkboE9YuN5J8OpH+iOR9z3GaXl9kmqrZkNyAzdk99F8moowYXiuthFwGENNMIis8Q2NA5juvnhLbGMdKWxZWLZYWODf9D39AxcufBHpK+o5mc2xq4le+yevH9Hsn0ONuAK+EysM9NFqSS2BDeexdm8P+AcRyXlJUn53VO9FNtbOKNL8qHAVY8APEzPQNAeqe6q9sjfUorvQWwDzryZBRtV4VnGx2GxGxiB4H/msNhFac6AwSnnEe2bS3Wsfa58sVn4VfBfwTtjhdVdIhoaGhoaGkr8BqBTutYnB8v7AAAAAElFTkSuQmCC>

[image17]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAZCAYAAACl8achAAAChUlEQVR4Xu2VS8hNURTH/0J5hijvSChGSkgeGUgZMGGgKAOvkpEBKQNzE0mR1MfAiJSiKIMbhTBRpEQhj5BMkEfh//vW2dc+51z3fqM74P7r1zl77X3WXnufvdaWeurp39XgFu0pZlDFjsaaOWZotaObGmW+m9vmZMEn02eGZeMmmQvmrbloPpg9qi+4KyLoM/oT8LZyd782mV9mc2ZjQZfNy8zWNRH0uqqxIoL7YZZX7EcVi+m6BhL0c/PZLKzY96scNDkwXuVjxdmfmLWTsHXKC/xMVsRYEob1Zoli5zgiI0sjIuB2QeOcAI6bW4ocGW2OmFeKI3TJjDHzizHvzFezW60T/rp5Y64UT75tig/2Fc8kHD4y04p2p6AnmHOK48P7Q7MhG4cY99jMKNrMd1at/ZI7S4v3EeaqWdXs/YsaikmoDqhT0FMVC6ccLjJfzPBsHMr9oXHmrmIXZ2V2hN8HZoui9PLXWv2NktgBJuHJ4E5B52duV2HLRX/1e3bymyLJ8xxAKxQ+EjfL3dJOc1DllVACGdxQTDjQRBxizpufmQ2xk+wqu5t0SPXdz3VacSekwPHdLwJqmPuKrE+6phh4KmsTyOrmiBD9edBUhKfmWWZDJHqfyhvDIrig5imSmFh47lAsKGmZYsNKFWSxmZ21cUwgVJFUkkhIEpOMTllMtcEZFSJpr+JbjkgS5/GGIrhcaRxznChsa81Hs71oc9seUMxdE7+B7CdQJjiseiItME/MHUVwOGf38vLIsaoeo5nmter+SLR7ih1PR4QFHDPvFb5eKMrj3KK/JHZvjdmq9hcNTleajWZ6pQ/xC6kgudKFU1W6dGoXh9pcKj311FNP/5F+A7WqjoJw7ghMAAAAAElFTkSuQmCC>

[image18]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADcAAAAZCAYAAACVfbYAAAADAElEQVR4Xu2WS6hPURTGP6EIeeYRdW8GSikKSZ5JYsCAhAyMPAYyMZCZkoGZpJREBvIsIyEGN0pkYELkUcijCCWU5LF+1t7O+u/7//9vCXdyvvo656y99zn72/tbax+pRo0avYW+xgnGBcZxRVtEH+No42z5mFYYYJxiHFw29AbuG18aXxt/GNfIhUR0Gq8b7xgPGR8ap8UOcsHbjG+Nx9J1r7F/7PS/gIADxjlFHIH3jGNC7LtxcXieLJ8843kPfRlzXr5zGfuN7+U7+V+BbboSo4U+q1EMbQhBUAb2fWq8axxlXCFfFMRE7EjxzUX8n4MV32c8aOwX4p/kE1qenifKhcR8zAtD3+nGPfIxiIngHcSxaQZjh4Vn7EwulyDWLrcB72Je0S2/gcAyv9i1PGnAtZW4vAhMvp24rvS80vhA7oQRxq3GZ4kXjEONM423je+Mb4zzfo3sjk75uIty629vaG2CWfKPd4QYE+xJXL5vJ26pvBixmNi3dAz94rexO7Z/rMb8B2uNH9M9O8y451Vzd/DSUhhYpp7FXUn37cTxnvmqxmL3CPqxkxm5aJVFCuRcXm0cKbd5y6MHOzDBq2WD/q4tQZ70oBBjBylkWDJjvXzsrhDL4Kz9Im+HJ+UauoFzCLucUdUBe45P980KyhDjNVUTalVQyDHix0MsV9YIbJcrb8YJuQCENMMMeV5mgU0r8k65uIHpmVU8omoVhxs/GKemZ5CPgifyRcirfDj0Adk+UTT5VoqbK1+AWNzIoRvyBecPCrARG+W7SZz+6+RFsDyGtEqV8shbclEZ/MEcVfW3wYJQUdlhwEd2F7FOeTGI43DBK3kKZLCYZ1VV54yvctEdxnMpxi5i6S3yb2bX8b4GW8a8KVkm8SL57xlWoVJhR5I5rjQ5hJAXxk3GR8ZL8pKfsdD4TY07STG4qe45w/cupzYsCBDDLx1HxCm5c04bx6b2PwaTX2LckO6bAbGT5DblGsUDDmWqW3k4x0M9g8VtdUC3a6tRo0aNGjV+AvGEvsm3OGrpAAAAAElFTkSuQmCC>

[image19]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADkAAAAWCAYAAAB64jRmAAAChklEQVR4Xu2WTYhOURjH/0IRRVGMzw0rYkrRRM0CZaNmqSwtbGblMzt7Jc1GpCYLWYiysDKLNyyEkjKxYEEihKbGhnz8/z3n9J77vOceV5m3TPdXv6Z57nnPeZ5zzj3nAi0tLf8Da33AsZRupPP9gwYspsfoGv8gw9zM/6vonEx8gK5Gg5xW0DP0m38QWElv0Pf0Jv1ER9GbTAkV94b+oq8zng3tNBnK4z69GJym43RBaCOG6XP6FtanfnMcmWKVpFZHHXdgjT0HYPGDSUyD3YIl3ZT99CGsvxHYjtAqrKOn0F0l5XIZ3QIPhXiKxn5EdyaxffQn/ZHEKpSKVIff6S4XH0O+fR0n6WEfJEfpkuR/5aIJKfESNnYH1l6kOyVLqchX9Cvd5uJKOte+Dq3IoIttp/dcrEmR12Fjn6fzQky7QrnW5lQqUgWWiowz+Tdoa56jV9FNMqL+tCIX6Ga6FfbO+gnyxHye+QeRfhepvj7D3iOPJuBE+Bv5AEu+7mTeADuAvsB2R5Z+F3kJtlp1SXs6sLFGXTwyQT/SIf8gpd9FvkP10PgTV2Bj6a+/KxfSp7DVLFIqUrOko3mPi2s1cu2boN/pmvDEPJ7QZUlcOeg3GjOi+/A0evvR5GcpFaktonjuntQ7ENlC79JFSSyHxqorUqiQ3S42CZvo+A7H91Z96J7VySrX09uhTQ96+Bg2uP9i0Hujl/4OuvfZDtgW1gkZiSury76Evq5KRergSLeeClJ7fRjE3HS3KpZTeVWIs5ozvat0fL+gD+gR2AqOo7pqe+kUCtslsBzWf6mdPh+vwQrT7tAnp969SLwPc+rZjKJZ9+/urGMTqp9osw4Vp8OopeUf8xtn1q63aEanyAAAAABJRU5ErkJggg==>

[image20]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAZCAYAAABzVH1EAAACwklEQVR4Xu2WT6hPQRTHj1DkXyIRYoGisJCUJAuJhQ2KIhYWNmKhiJWShQ1CKSlZyZ/IQgmLlx0WLMhC6hEWSiIk/7+fN3Pemzt3fve9sHrdb316v3fOuXPnnJk5c81atRoUmiImiaGJbUz2/3/TEDErNxY0WswWw3NHprFir3gtPom38e9OsVTcFON7o4M2iTviZeS5uCjORPZYKEpRJDBPXBfdVVdFk8VVC5PpEo/EjDQg0UbxIbI9sbMql8V7cTaxu5aIDeKSuBt/O4fFt8g6f8BFVanwIvFZvKi6e4T/lngmpkfbefFb3BAjog0x3mkLkxyZ2FNRuI9iYe6ImiieWJhTrlXil4W5FtWUCNnz8InENkccFQsSG9piIcFOK+V6YPVt5VomvltIKNcOC+O/yh2upkSuWHi4tpyZWC1Wjdj+lBYll0+WlUvFtnwcfZy9opoS4cBRodXimHgjLohpaZB00MJLuqvmoubnhqhh1le4XJwZzscua+h2TYlgZ+BT1lclX34S4uX+PHGbY8zfyMd9aKE7OXTJH+KIdT57PRpIIunW8vh3Yq5YG2O+iMVJnCudVOlOcfm2Opc7pGsWfIesvu161ZQIHYbDvjKxMRliGZgkPBHGKHUb7gTuEWLgtphQiahuKxLKtc+Cj45WagQ9akqEM5JXOk/Et0SnRBDtlqIQU5K33fxdLu6Rf0rEq8SEXWwnthWTJ4mpFg45K0dTKImzwzi03pK8GJ0met/C88etw9bCyMsZhOXPg7zt0TXGRdt+8VOs96Do4/OCl41K7Gi3+Bp9pWbANmO74ecTxsUFy0ry1UEBZia+itgivm9Tuizc6C5W4KmFhA5YWP6tVk+aBLgjaJMkxfcR30onLdwz3PqMlWqN1d+fQsHuWf/fdgMWAy0X26x+UHPxKUHl+QhcUXW1atWqVatBoD/re7z7g8u4pQAAAABJRU5ErkJggg==>

[image21]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAZCAYAAABzVH1EAAAC7UlEQVR4Xu2WS8iOQRTHj1DklktKiAVKkYWQWySJIpKiKAsLG1EU2SlZCCWUiGTpEkmiWMhGKFJsXOojFhQi5M7/18z5vvPO+zy+wkrvv36975yZZ56ZM+ececxaaum/0BAxWHQNtj5F+6/VRQy0jpfVqbsYLWZYeqYz9RWbxXPxXrzMv+vENHFJ9G8fnbRCXBFPM4/FCXE4s8nSOit1W9wSR8UTSy+KnmLRC8UL8Uy8Fo/ErDCm1HLxNrMm2HHUKfFGHAl21xSxTJwU1/J/Z4f4klnqD7gWWZp0XLD9tOSVXrmN5y6KMe0jzA5YGkdfz2Dn1A5aWmS0R+GYd2JC2ZE1SNwXE8sOaZ74IT6UHXPFZzE12FjgVdE7tzklbMd9gCWPYHslxgb7qmwfEWxVIgLKsHIRul8tbajUWkvzExkNwjujQhsvMnBPsJ3PNuLTxUliwzPuueHiYbZ3pn2lIcgXW+YhYXkv95F7v9VM8cAaPUq+UGGi/GVtYmi2bQu2zjS+NGR1E6et2hnkDPmx3mqq3QCxWKy0FPNzrNkbpYhT8qhfbnMqnA4LYJ4/lYfVHUvVyaFafhM7rT73GkSy+tHVbWaypeT3TSAPtY9iUrC74qKq7hSXn/SxskM6a6lvu9WvrUEMLguAi5Aj9LyiuapyJoo7gXuEMXDZ0t0VFcOKDZXaYqmPitZUCPBOafQQ2VjYOQEWsDu3efF0S6HpIVG3EUS5pew2lc4sL7t1p8o9UrkRPHJXXBA9gp2JeAAPuIhLbtat1hESlM8zYpilhG+zlDvzc38pcod5Kb1Vcmc0LTTrpqXn91oRWjQwkkguzxEWzX9EvnhIlBAKnAzixCgA2MvQ2yA+5b6qYoBTOW36+bJwsQZO8pwlB4wMfQ3i5dzshyyF0nWxyxorg1+IVZT3ARvARplkUziEb6X9lu4Zbv14gaIF1jxv5Lu4YR2OrRUvWCJWW0rafyE+JfA8H4GzG7taaqmlllr6D/QLTTC8W0CfNToAAAAASUVORK5CYII=>

[image22]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE8AAAAZCAYAAABw43NsAAAEcElEQVR4Xu2YT+hVRRTHj5igmKQYmmQIYYFgLVJDwXSjVFBBKiQkumzjRiFFcfFDcNHGpLSFpPxaZKUpuhBFBF+6kVrYQhH8AyaiGJgYGWj453w497x33jhz3zMFse4Hvvy4M3PnzZw558y5P5GGhoYnxzDVc2nj08izqgmqsaohVRt/R4Xnx80Hqk1p48MyWvWG6sW0IwObfEXs1HLQzlzM2Q8Y7LrqnuqPSr+rhqo+Un2reqY92n5/vepi0K+qrZW+Ui1qjy7DnN+o5qUdD8NOscUz0QnV3O7uNi+o9qj+UrXEFjwp9OMd76muqbapLqi+l3JYYORPVbdVC1TDQx+Hs0N1R7UytMMI1buqc2IG/0zMWGixal/VHteW42WxsWPSjn4ZUK1N2tj8d9I5bU76kOqs6qWqDUOzwP1im2ZDB1WnVM9XY+AT1d3w7BwQe3+NmIflOKY6rxqfdlQwb0tsfSlbpNzn/KialTb2Cxb/RfVx0v6bmNd4COMVLPQLH6C8qtqoer16nqa6KR1jOu+LGSmCh9J2WMpeCRwQG4whG2GOuCaH32cd0QFy7JV649ZCrsFQbDBCG8byXMAGWChGLMEBMIYNR9yocZG0EY7zQ1sO5sJzc2Agfo+En8K8zP9m2pGwPG3IgNdnc3ud8aKxCJ1/VO+oPlddFjvViVU/rJZ64/FbgCfwbkt6nzqXRekCI19dqf46ePTbYvmbfFgHUTc1bQzMEEtBLbE0lnUcNp3mPLwOQ9AHbJ7nzdIpGWaLGdRDw3NgL+N5GPP+o7BB7CCZ1/WW2IXHTc3FVYI9fJk2BgZUl8Sc4zWxwzgumRRDwxnp3Ew8XxXboIeMGy9a343CqUxRfV2N6WU899DotQ6lTTRGWvM5ntNyIcstjfFupR0BvPmntDHgjsAlSY3JGmIe7wLv+VusXsJVCVNephyAP6U7B4KHPOPwpn7D1sf5szNSrKxhDdR5jOHvoDy4cA9ZDi2FVNASe78E5cz2tDFAP++7KIWyec9hgX7KGMU9CjAmxiUPOKnxShcG7/AuJwg+LjVehENjTCnfcYgcps8Z8QqiZDxPMeTvEtiAfkov5kkdpw312eSkjc3Ga95v23ixYFgMTN4jf3kOpPzAixzPcR567ol1yZp8xjulMsP7c5D3CFlu2xys+4h016KRNaoV0vG0dWK/lb31yWO7xYwIXO+rpDvPjFOdVB2VTtLkR1jgQh+kLKnauCWBsbyDIpPExsVFAmugdqSPg0hhTTPFEjiKEK7+xcEcvp8Ibb0KY1KFpyvAGfjky4YtG6SSZ8AuMa/LDeTETosZkduZcUul28i8x0ndEAvPn8XGp54NfOaxUT71KFYRnszBkfQH2yM7ML5O5EyK9vSCcTAaF01dieR5l9D+QeyfBjGSHmCO2GY/FMt7JTAOY5dJ/Tg+4ZiPEC19egEFqOfL6ZI/tMfJgPRXGGNccnLps/B/CRdAXa5tKEAoU4I0/AsIwVLp09AD/gtUukgaGhr++9wHr74LRaql8EEAAAAASUVORK5CYII=>

[image23]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAZCAYAAABzVH1EAAACoUlEQVR4Xu2WS6iNURTHlzCQVx7dEmKAomQgFIqRKCZSFDMDEzFQZKZkoAyEuiUlQ49IBhQDmWFgwsSjDjGgECF5/39n73Xv/vbZ3znXI4Pb96tf9561v8d+rL32Z9bQMCyYJvvkyCQ2Pvv9zxgh5+TBhNFyrlxp4dpeTJB75Qv5Qb6Kf3fK5fKanDRwdWCLvCGfRZ/Is/JkdI+FSSlCpxbIy7JVbWpD+3r5Uj6Xb+RjuSq9KGOzfBfdnsRZlfPyrTyVxJ1lcpM8J2/F/91D8kt0o9/gMMvj5GL5UT6tNrdh5q7KeUnshPwZ28YkcZ7Xb6GTaTyFiXkvF+UNkanygYU+5ayRPyz0tUi3gRCj02eSGDNC7LWcn8S3xfisJFbirnWmlUPqfrUwoJwdFp5PZhTpNpArFm4mP50NMcY9PnMz5aMY78WxPJDgnc33IWl5P7ax94p0GwiVhQqT4i9ryekxdiCJ9WJhHoiMkhesPBnsGfbHLutS7boNpAR5SnWZGH/7/XRgq1/0B3ha3bNQnVyq5Td52Or3XpvfGchSC5vfBwGeap/kkiTupJ0qnSmOr/TpvEFcstB20DrTboChDoRN/FCOzeKlPZPCmcA5wjV4XU6pXFFNKwaUs89CGxWtVAjaDGUgrAAdOBJ/8+IVcrINpkTdQIByS9mtK51edutWlXPkrwdCXnKy7rfBlKB8XpQzLGz4loW9sza257B36Ailt4RPRl1H71i4/6jVpBZBXs5DWP78Ikqdp0QuqcDKACtGASCep95u+Tm2lYoBacZq084njMMBy0ry1cEEzE7aKrDx8s7hTQsnPviBWDI/DxgAMcokg2IV+VY6buGc4dRPD1BYZ53PTf0ub1sY1H+HTwlmno/A1dWmhoaGhoZhwC8pILissCH1KgAAAABJRU5ErkJggg==>

[image24]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAWCAYAAAC7ZX7KAAACUklEQVR4Xu2Vz0sVURTHv1JCkWFQZFn0IMpVkBC0U4JwFUVIoPv+Ag2KWurSEJclgRTUIqldBBb0oIgWbgSjEISIIBQsgmrRQv1+35nrXI/3zXu2CWK+8GGYM3fu+XHPnAFKlfo/1EaOemOBtP4YafUPtqEh0utsHWSHs+m+09lqwa6RZfI5wXi27hB5Sn6SKlkhA6Qle74drZIb0b2KUCV/yDsySV7CfE3ly0wXySC5Qi6Tk7AKKribsIAmYEndyt6RDpD3ZD6yNdJuMg3bKxXwfViwV8n+6PkmxS8GXSMvSHt2vwhz0r+xIneiajUr7XsH9QNW8RpK2Xi9IZXo/hfMSbzhLvIsszejs+Q18hb864BjhePf6eypCu+FBSC7gi/Sddi3EPq9XsBfyF1ymryFfUPd+bKtOkO+eSPSPXyKfM/sclikGWzuSR+wEnkASywkpW9Jg+BDWOSlqt6DZeklZ8p4AdYqGmm3YRVo1BL6DnqczQecUqh63f2Pk6+wRSlprD0mv8lHcok8QsGGsGqNZtdYzQSsdx7C1vr3a1J19VCjxWsPuUBORLYj5BMKjgw2+A+SwxHaQ36UiO73Ia/kHPLWkU/N4mRB4vKnAh6GPdPc1fyVNLs10jSqgrrIKxT/BeXLV1jFmiXnI1uY88mxqd9imARFAT+BDX9VSf38HPmslsIpnYtsXvKlNSPIE9PI0ygNJ6gW0AeodfqRbFHIxmceVIEdl8aYNlAfKzgdW6w+8gN21F6aQGGex4QCqeWWYH9C+VFlx2AFKlWq1L/QOjR4j9Vxnpt8AAAAAElFTkSuQmCC>

[image25]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAAZCAYAAABkdu2NAAADIUlEQVR4Xu2Xy6vNURTHl1BekUfehTIxU0JKBkIUEgYeAwN5DJhQV8k/IDGgKCkZiCKPgaIMTlGUgcijRCERigiFPNbnrr3u2Wed/XPvJbPfp76dfmv/9mOtvdfavyNSU1PTDf1VY1RDgn1QeP5n+haex6v6BHsV41Rz0m8cq8Q61S3VL9U31VfVOdVEMac3NV/tZJ7qgup5ppuqo0mHVatVA71DDtFjkrzDJ9Vx1YDsvSpmqhpi/W6rXkt1YLAvFZvvgGpyshGUjaoHqiuquel9Z5KYA3vFgrI9PbsuJvtD1bTUpwscPCFN55ioJ7AwgkD0cvqpzqZfh105IraIq5k9QrC+SDlAPi5jlMAH2p7FBhxcFo09gH4N1flgB5wYnD1vFZv8pWpqZo9wRF9EY2KU6r7qZ2wQO5qXxea4FNr+2sE8okMz+0jVruwZ3oq9ty3YIzh4NxoTHNvvqqfBDqtUP1TvVbNCW6eDy1WzVQfFjmke/T9BPwb+oFqrGq46qRqWvcNxwzl2ZkpmL0GRIqdK7JDyDpG/n1WPxY54GyygI/06b8QSloh2B7vHsWFyFznnLEi29Zmtt0wQ2zl2kNNGIFwrxZybL+XcLdKQnh2p6WITU23ZQXaSfhQULzJbxApHKbr0yxfrihAkgkgOkosRdpCTtDA2VMExY6H8VkVltOqeWCV12HHuM+417kUgH1nADH8pg6Bwp7E4330KUYQxaIvV2bkm1n4sNsBm1R5pdcRLbkPavzKcNWKOxDuLnKAvOwccqSoHHfKKPtSAEt7uY0aeSIWDXurviFU/hzJf7JBBVCkcpTzFIV8MFy/Ha3GzuQ3GYT7yqcQrqT7mwPiVc1BW87vJqx7V1IvFkmRD+5ONSkkgHqVnZ4S09oWGWF9ORn6lMBfFgcXxTum0YKPvaWn9DGRD+Cgh7zmB+Xxt8Hl1RmxhnOd90vpdR+JfFxssT+SxYk6eUu0Uy9mP0v5NiFOHxBZKvjEPzpJ/N8Tusd1dbxteWDywJb2T1hpQCbuxSLVBen/pswsrpNmXfwdV+DxcGd29W1NTU1NT8z/5DY8dveLv1EF8AAAAAElFTkSuQmCC>

[image26]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADYAAAAWCAYAAACL6W/rAAAC6ElEQVR4Xu2WS6hOURTH/0IReedS0pc8wkCRiW6JJPIYMEAkM4oM3HK7km6MhBRKSUkGDETKLUp8SRIDE4+SAfIISYSSPP7/u/b+zjrbuee7g8vo/OvX9+21136s/Vj7AJUqVfrf6kcmp0Yn1Y8l80n/pM5rIGklI9KKJor9z0bz/qegF/2rwxnkEnmWr2qoRm6R++QEeUkWegdYP8vJW3I6/F4l47xTD6qR2+Q5rO1dMtU7IOv/A7kMm+s5Mtz5NKToh5I55Cus41RryQ2YX9QAcp6cdOWzpL3hYZpEXie2VGr7m6xytkXkF+l0tivkIRnjbJthfkucLaeywDTZx6QlsWtlhaSg6+QYbGWjxqO4Ty8F/wN2fKPifOrIFlTlLjIolKUVsEU54mw5lQW2A9b4GpkQbApSq7cllIeEevntCTZJK/nKlYsUx9ZvatOxmx5s6jsuZJRfgEKVBSYtg9Wrc3GYDM552LE+iMznC1mJ/A4WSTum46TjFzWXfIP1o12RygLrad5NHRTEXvIdNsBPshMWjNdEch1ZcC9gWbRMRXdsW7D908BGwSZ7hgwj65ANquDijswjb8gmctT5fAz1ZXoCO8oxwylRaD5+J/s8sOPkJvJp9QJsIKX0abC7pwTTgSxQ7dTT4OcvfJFqsDE+w3Z5ffgvZgWfPg9M9ngcvOI9UJ0yp9oqC6bahWK711LkfXQsFUinsylzaleVqKJiVjzlbDmVBabHOH2fpAUwf2UtvXVaXZ/ZJO3efuR3bDEsEC9NrguZn97E92RmwwO4Q+6Rkc6md0xtNf5f0uBKy1qRd6HstQ92T3SHouK9U538R8O+FmRTXZTa6GhFxfdO+AdfkzuEbGwt8uqsulsbYElrTSjrauj4ptekW9r+eMk9dWQDKyMegHV6kWyF7Y52wmfFGuyz6BPZDutD75DfHU28DfbW+QV8BPtM0ueafjcm9ZLG2g3rX+21kA9Q/n1bqVKlSr3TH6q7xdyCcT4QAAAAAElFTkSuQmCC>

[image27]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEEAAAAZCAYAAABuKkPfAAADQElEQVR4Xu2WS6hOURTHlzwi70ekiBh5lIEQKZc8kijPlIkMZCBmlIEUJgyUPEokA4mBFCWPwY2JGDAQEgPyCEmEQh7/37fO+e7+tn3O/dzuHajzq3/3fmvvs/faa6+99jarqKj4D+knjZB6BrZe0e9OZXRsED2kYVK3yI4TIyNbM+yy9r+jfY/0UvotvZK+StukPtJ1aUK9t/u4RbolPQ90QTqWaZ801f5eRx0ivV/6HjeYO/RM+mw+OQMy2TdpZ9CvGQjcF3NnimCRP83nXC8NzOwDpNPSFemONDizAwubJa2SbmTta7PfaKP0xDygJ7Nv6nSXBpmnXKt5pxiC8MDaIrpa6tvQozkmSY+tOAhjpPvmPhTultghLYuNGeOk19LsuMHaNjO1xhrtBeGepR1vFsa/JG21dBDY/Yvm85+L2mJWWONRCJkv/TI/vjGTpQ+WXmONrgwCu8pZPmxec1JB2GQ+N07ibBkEAX9T7LV0JnEMyWLaONJJmgnCdGmJdERaas1XZ767KY0yHysVhIfmc58xL3JlzIgNGRxRFphaAz6TIWTZkKitTlkQ+kvXpJWBba70Q7oa2FKwI7uzv1AUBOblLHOmOwp1gnHums+Ti1qDr+fNN6KQsiCkyIsM0S2DXRsa/E4Fobf5vGQLAY+hcIeLQnwTc9B8HP7GbDdvo/AOj9rq/GsQcBany/qz+DhTUkFgbsZpzf4P4VF0Qnpr3gdxjU8JO1mj/+sam2pMM39n0L44aqtTFgTS+b01Dl7WP4e6wX0fPl549PANi+I31RyKgpDDbYAPZF7+TUjejlI3BwvPg9ihIOR3K68vdgZ4XD3N7EWQsnEaLzLfEf6Gac04FEfGTcGNQJ8Xlj7XbBDtRUfqkLU/R614UFDoGFd9CuJla6uq4XXD1ZdzPLO1BLYQiiMFlSDwN7zG5phfj6T6hsAOvCF4rTI2ZzuGcR6Zt68J7DwEx0tHpXfSvKCtgfw8pkQ6A5Nslt5Ip8yLC87yVmeinAXSR/MdjskLU6x8Dpgo3c7sZ80DTfZ9Mn/8HJBm1ns7eTEsE89lntydAmm0XFpobe/5zoaAjzVPb97+LZa+CSoqKioqKiq6jj9TldcT9EDAbgAAAABJRU5ErkJggg==>

[image28]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAAXCAYAAABu8J3cAAACDElEQVR4Xu2VTyhnURTHj1BE+VsSJTVhpISdBSWjZEyxZaeG1WzF3sLWYhaTkpVitrNQFr8oCxazIdNEDRk1appYKMrw/Xbue517vffLz079vvXp/e6555173j3n3p9IXnnlpkrQDRrCiWeoBHSA8nDCqBDUgxpQEMzFWgf/wCr4Dvr96VQx+CfwV/RdPhdBsXWCBsCJqM8VuATvPQ+oAvwETW7MbJlUV+yRrhlwI7oQ1QYuwFzsoXF+gB43fiPqcx97QFVgH0xYI3QKfkn2Mn0AD2ApsM86e6RpNz53Y5Yv42yxWDMuOmqNzvYfDAZ2qwXRYFzYirHsIixfr+haVB04khwSoeN4YLdivbMlkta4k6LzW9YYlYbbZ8VtTFrE6psk+6QlwjJviPYGy1nmT2ug+cDGsiQtYpWRZJ9siUyBPbAN2v1p1Zpo95+BQ9GjxmDD1inQS0tD8cPp0xxOULyUosuGPcI74a3n4SutWdlXtEeXFo/riPiliJL1PrRU1NmKu8NdKgrsVjzyDLYc2O3xbQV/3Nge8yhZ75AwIMtRa2xsqHdmTH0WLQcvQIrbyqb+Kn7CXPDW/e4E1/I0kcTSMPAO+CLa1dyN8IqmDkRvyBZj43avgN/gIzgGm6Da+DSCXdFyMwHGuBP9a3iiPtGdGRPtk1zEXmByfJ/PqDesrM+QJBzdvPJ6FXoEIF55WR4L9v8AAAAASUVORK5CYII=>

[image29]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAAXCAYAAABu8J3cAAAB4ElEQVR4Xu2VP0sdQRTFj6igGPEfCGJQEAlYaBAJggRsLNXCFPkIsbcSv4IEGxUsFEln0oWAhYVY2AspRLRQUIhFrGKX6Dnv7n07O89dX6z3B4c3e+dy98yd2XlASUn9NFKvqWmqL5r7H1RjheqMJ0gz9Z7qoRqiuSqn1A11Sz1QH1GQnINetENdIrsY1ZmlflG/YfXPYYvOME5NBc8a/6U+BLF6kPl/qDUyT51QwzBTylP9uyAHr6jDRBo797CiM0GsCHVjGWYiNKJfPasLu0lMLCSxEQ/I4Rq1STV5kPyBJc4FsSLUvUHUGmmlvsNqLSUxobqKTQSxipn4PKgbMpNJzEEGDpCuPt4afQjtwbP4BDPSH8UzyJSS9mAtL0JdXKcWkW8kRl3ah70jbkCGSeoMttLn0EH8CiterxE/1Orik3TAJo/iiRw+wzrh1GNEC/xCtcUTjrZgC7Y6GRLqTNEeXsDunqtEGqvdksajaWoF1V1Fut3a1u502tCnJyNqsVDSNvWumlFLL2zlrrfUdSKNw/Oluqqvg+t0wW7iKjow36gBpEXHqGNqKMjbgN0F3rGYvK3xbqsboXHdUTJTwS80b2moH1SLJ5KfsL+CN0HM8XshlD59NxfPuUpKSl7EI61AafIF3t3KAAAAAElFTkSuQmCC>

[image30]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAWCAYAAAC7ZX7KAAACWElEQVR4Xu2VPWgXQRDFn4igqFgIfmCEFGlCBAsRsRJFMSlsJKBgGTBBBMFCURAEsbDQgKQSQVLaqBDSRIuAIUoaG0VQA4mIoCIhgmIUP95jdri5/d8RLJJC7sEP7nb29t7Ozs0BjRr9X1pHdiT+VZvJVrKRrMhirpWkjezMAzXS3MuwdVt0k3whdxPXyJrSjGrJxGnygAyTefIRraaPkTnyDDbvHtlSmlHWKnKHfCW7shj2kqvZmDawkGJ1WksekT9kQxrTKY2TUbI6jXWRd7CMufphzw2EsahX5BdqDMvciWzMF8w3EiVD97G44bPkMVmf7qUjsOfiPJfWOENmUWHYX6AFonxBZVCZrJNi+8L9NjIDKxOXSmAc9i7XQfIbrZlXKZ0j21FjWAWtQJ1hxSqLPlMfLNs/YCcWVZXho7D1ZVrmJZ2SMn4Iha8lM9xLTpEX5EkWq6rhIdj6Qu9SZi+QK+l6yQ271NamYCURO8VP2FH7mDalMTe0h4zBnpeWzbB0kXyCZdaltvYB1vLekm7yjXwmnTCzMu2qNSzdhnWFKNWdDOf1GHUcxbFGeX3GNVWXsa+fh83xj1MGI4dhGxK6LnUS7TZvXzKqD0IxSd1gkDxEUYve+nLDyvACih6uv2C+gafkJcp1HaWsKruVGVa7mSbtYUz3Iyiy0oPC3PU01kHewzbi2kSew+Z4vcqwuod3A/0dv8NOok77UWRY1y2aJG/IyYT6b/x16pgmYL9eHa9rN3lNbpBLsLqTOf1aXTKuWh0mt2AbOhDiubxcIvk31qhRo+XQX/M3ndIM2iRIAAAAAElFTkSuQmCC>

[image31]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAZCAYAAAC7OJeSAAACAklEQVR4Xu2VvytGURjHH6EI+bkIhRgkCcnCoCSKlJTCZsCkDJRk8w+IRSSbwUgWgyiJTUTKwMAgA8UiP75f5xzO+7z3vvWa76c+wz3P+fHce85zrkhExP/Ig4W6MYR0WA0bdUBRDJfgnecxXLEuwg6Y6gY46uEXvJfYwfQM1tl+PfAJbsM1uAlzbUxTAPvgM3yHM3DAOgxPxKy56wY4xuSvYycsFfNmV7DB9smEF7DIPhOO+4RdXpuGC67DFNXO+ZgI4zEs6AaQDQe95ya4AzO8tl4xk/GTB5EmJs6kNXwpvlxcMkPqmW8xLeZ8OPhpN7xnwgRf4b6Y5DVckHH204yLSeRaBzQt8FC1cc/DkrkVs62aVngK8702HthR+AGPYLkXi4MZ38AS1c5EkkmGW7QFJ2zM2S+mMC5h82/vAFgZLD9Owsl8ViW5ZNyZCNqidjEVxuqtUrFfWBWsjlkdkOS3iVvEBf3qc7Avx4Qd7h9YFewwpQMSfID5md/EnK8cFeMinEuXNKmED5IgGU7GSdmBJavhm+7BLK/Nlba+R9x5iStby4iY2COsVbEfeAu/SHgyhBXg3z0HVv8WZrXwkHK7eWn68JfDG5nzTErAr8BRI+aqZzLdKuaYEzPZvJhtO5fYA8ivxvGJXIYVbkAY/MxtEvLz8iiTv/9Lon4RERER5BtVhXomYwY+jgAAAABJRU5ErkJggg==>

[image32]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAABmElEQVR4Xu2UvytGYRTHjzCIIqTIwCCLGAxSBhmUwaYoLBaLLIo/QAYbyiKyImVVDGIRKykxkH+B5Pf3+z7Pc53n3Pvuyv3Wp973e859znPPOV2RXH9dNaAPtNmA0Rg4Bo+ee7ALNjxzoDHJVtoDt2ALnIBJUKITlHrACPgGp/53YAm8eSL1Sroyk3nbSuMH1YNn0G0D0CD4EhMbBh3agBbEvVGV8YPY1mtxxaymxb1lqzaHwA3oVN4hWJHiLeNB25KON4ArcUWiGAM0yRqoBeeSbmFQGdgH48ZvFjcjzmPWxAqaAi/yW2xdis+DrXoH7eIuEuBmfYBlUJFke9HgDZrAALgTV4gPlau8oNBz2yrmHvjYookV9rpF/ecbMPET9CufCq1iPEtcGMa4FIm4HZHhNS8umQ9phXy2Nktc/VQR9vJBG14c4pOki4R5ZF2sDlyIK8LNjDQBRiXu8aa4r4CeCQ85EnfIjPKZ0+X9S4lbn6gUvIIzcau3CnZAtcoJW1cMzo+flaxFScQD+Tng7jPZbk6uXP9VP4NFXKd6oC7cAAAAAElFTkSuQmCC>

[image33]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAZCAYAAAC7OJeSAAABr0lEQVR4Xu2VzStGQRTGj1BEyUfKykdWbJRYsVDERkp27CywssOfIbGx8Q9YsGGjWEmsRVZIFCsLNvLxPO+ZeY0xM1csbO5Tv3rvnLnnPHNnzrwiuXL9XSWgHZT6gYCWQIs/aNQEVsG1wxFYN6yAQYnUoYkOsA0uRZOlxPlPoNsPGNWBMfAIXsAimDBMgmPwDnbtC1bloFo0MQtcSdpMDdiTtBkrFtwQNe+qUtQI40H9xAyTLoBlyTZTJlpsxg9ADeBU/mimF+yAZsk2w4KxObOiRi78gFWWGW7PFugX3dZYIas+cAJqnTEe2GnwCg4l3gCZZvZBo/mdZYZbtAnmRHNZxkU76wz0FGcHlDLD4kPec8qMPROh+IBoh92KXiNBpcxwj92OyDLDLWJBmvLF3KwRO9wFxcywMLfIvcBuRJPdm2deYK5YhHG/pak2cCe/NMOE9WbMws/7DIbNc0Vx9ud5ibXtlGjsAXR6sYJYcET003K1XV/D38TW5ly+466e3cJD+gbOnXGKC+KNzE6al8hfAVdGpz4Holvkyn49f+4oqAqM+6yBVsmVK1euf9AHNWZ3BLhtn2UAAAAASUVORK5CYII=>