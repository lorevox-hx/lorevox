# Architectural Evolution of Multi-Modal Agentic Systems

**Achieving Data Consistency, Resource Orchestration, and Ethical Agency in Production-Grade Personal Archives**

---

The transition of multi-modal AI systems from experimental prototypes to production-grade infrastructures marks a critical juncture in the engineering of agentic workflows. In systems dedicated to the preservation of personal narratives and digital legacies, such as the Lorevox framework, the challenges of state synchronization, resource contention, and data integrity are amplified by the sensitive and heterogeneous nature of the input streams. The fundamental engineering hurdle is the "Concurrency-Coherence Paradox," where the requirement for real-time, low-latency voice interaction conflicts with the necessity for consistent, deep-state rehydration and complex extraction tasks.^1^ To resolve this, architectural paradigms must move beyond simplistic request-response cycles toward a unified, event-driven model that prioritizes a single source of truth while managing limited hardware resources such as GPU VRAM.

---

## State Management and the Single Source of Truth in Distributed AI Environments

At the heart of the "Single Source of Truth" (SSOT) problem is the collision of six distinct data paths — ranging from real-time chat interactions to background biography building — all competing for the same state fields. In a naive prototype, this often results in a "last-write-wins" (LWW) scenario, leading to state clobbering where valuable manual entries are overwritten by low-confidence automated extractions. To move toward a production-grade system, state management must be reimagined through the lenses of Conflict-free Replicated Data Types (CRDTs) and Event Sourcing.^2^

### Mathematical Convergence via Conflict-free Replicated Data Types

CRDTs provide a framework for strong eventual consistency (SEC) without the need for a central coordinator to manage every micro-transaction. This is particularly relevant for collaborative or multi-agent environments where different processes might update a user's biography profile concurrently. Unlike traditional locking mechanisms which can introduce significant latency, CRDTs use commutative and idempotent operations to ensure that all replicas of the data eventually converge to the identical state.^4^

The implementation of specific CRDT structures allows for granular control over different data types. For biographical data, an Observed-Remove Set (OR-Set) or a Last-Writer-Wins Map (LWW-Map) can be used to track specific fields such as "Place of Birth" or "Family Members." However, the limitations of CRDTs must be acknowledged; while they guarantee mathematical convergence, they do not inherently guarantee semantic correctness.^2^ For example, if two narrators provide conflicting birth dates, the CRDT will mathematically choose one based on timestamps, but the "truth" remains ambiguous. This necessitates a hybrid approach where mathematical convergence is paired with semantic verification.

| CRDT Type | Operational Mechanism | Use Case in Personal Archiving | Convergence Property |
|---|---|---|---|
| **G-Counter** | Increment only; merge takes maximum.^4^ | Tracking total interaction turns or system metrics. | Monotonic increase; no decrement. |
| **PN-Counter** | Two G-Counters for increments and decrements.^4^ | Managing token budget or resource quotas. | Supports addition and subtraction. |
| **LWW-Map** | Key-value store where updates use timestamps.^4^ | General biography fields (Name, Location). | Last write by time wins mathematically. |
| **OR-Set** | Additions and removals; concurrent add wins.^4^ | Managing lists of memories or related people. | Convergence despite concurrent edits. |

### Event Sourcing and the Persistence of Intent

While CRDTs handle concurrent updates, Event Sourcing preserves the "intent" behind those updates by storing every change as an immutable event in a journal.^3^ In the Event Sourced Entity model, the current state of a biography is not a static row in a database but the result of replaying a historical stream of events. This approach provides several advantages for high-stakes AI systems: it enables full auditability of how a specific fact was derived, allows for state reconstruction at any historical point, and facilitates the creation of diverse "read models" or Views that can be optimized for different parts of the UI.^3^

In a production-grade system, using Event Sourcing allows the AI to distinguish between a "manual correction" event (High Confidence) and an "automated extraction" event (Low Confidence). If a conflict arises, the system can re-run its projection logic to prioritize manual events over automated ones, ensuring the user's authority is maintained.^3^ This aligns with the "Human Authority" pattern, where AI-generated data is treated as a proposal until explicitly promoted to a "High-Confidence Truth" status by the user.^6^

### Synchronous vs. Asynchronous State Propagation

The choice between synchronous and asynchronous communication protocols dictates the system's resilience and latency profile. Synchronous (blocking) calls are conceptually simpler but couple components tightly, making them prone to cascading failures and thread starvation when one component, such as a heavy extraction LLM, experiences a delay.^7^ For a production-grade personal archive, asynchronous messaging via brokers like Kafka or NATS is preferred for background tasks. This decouples the real-time chat interface from the data extraction engine, allowing the system to buffer requests and apply backpressure during peak loads.^7^

| Communication Pattern | Mechanism | Latency Impact | Resilience |
|---|---|---|---|
| **Synchronous** | Direct HTTP/gRPC; caller blocks until return.^7^ | Low for successful calls; high if blocked. | Low; single point of failure can stall system. |
| **Asynchronous** | Enqueue tasks; fire-and-forget with callbacks.^7^ | Moderate (queuing delay); improves TTFT. | High; messages persist until processed. |
| **Hybrid Flow** | Sync for Chat (interactive); Async for Ext (background). | Optimized for user experience.^1^ | Balanced; protects interactive response. |

---

## GPU Workload Orchestration and Resource Efficiency

A significant bottleneck in multi-modal systems is GPU contention, where high-priority interactive tasks (e.g., Chat inference and TTS) compete for VRAM with heavy asynchronous tasks (e.g., Data Extraction). In a prototype environment, firing all tasks in parallel often leads to 30-second timeouts on consumer-grade hardware like the RTX 5080. To mitigate this, the system must move toward sophisticated scheduling and hardware fractioning.

### Multi-Instance GPU and Resource Slicing

Traditional GPU usage follows a first-come, first-served model which is inherently inefficient for mixed workloads. Multi-Instance GPU (MIG) and GPU fractioning allow the physical hardware to be partitioned into virtual instances, each with dedicated compute and memory resources.^4^ For a system like Lorevox, the RTX 5080 could be split such that one partition handles the low-latency Chat logic while a second, lower-priority partition handles background Extraction and Bio Builder updates. This ensures that the user never experiences a "laggy" conversation simply because the system is busy parsing a previous turn's data.

### Task-Graph Execution and Sequential Hooking

The "Sequential Hooking" method provides a software-level solution to resource contention. Instead of firing the Extraction LLM simultaneously with the Chat LLM, the system uses a Directed Acyclic Graph (DAG) scheduler to sequence these tasks.^1^ In this model, the Extraction process is "hooked" to the completion signal of the Text-to-Speech (TTS) operation. This ensures that the heavy VRAM usage of the extraction pass occurs only when the GPU is "idle" from its primary interactive duties.

Furthermore, inference request batching can be used to optimize the total number of GPU wake-ups. Instead of performing a separate LLM pass for every biography field, the system can batch multiple extraction requests into a single prompt.^9^ This reduces the context-switching overhead and improves the overall tokens-per-second throughput of the system.

| Scheduling Strategy | Mechanism | GPU VRAM Impact | System Reliability |
|---|---|---|---|
| **Parallel Firing** | Simultaneous Chat + Ext calls. | High peak usage; leads to timeouts. | Poor; frequent 30s timeouts. |
| **Sequential Hooking** | Ext fires after TTS completion.^1^ | Balanced usage; sequential peaks. | High; prioritizes interaction. |
| **DAG Scheduling** | Task dependencies define execution order.^10^ | Predictive; allows resource pre-allocation. | Highest; optimized for complex flows. |
| **Predictive MSched** | OS-level forecasting of kernel working sets.^11^ | Minimal thrashing; optimized for HBM. | High; prevents page fault storms. |

### Memory Management and Demand Paging Challenges

Research into GPU multitasking (e.g., the MSched framework) reveals that standard demand paging is ill-suited for LLM workloads. LLMs exhibit poor temporal locality, often touching their entire multi-gigabyte memory allocation within milliseconds.^11^ When multiple tasks are context-switched, the incoming task is forced to "fault in" its entire working set, leading to severe memory thrashing and underutilization of high-bandwidth memory (HBM). A production-grade system must utilize predictive memory management that intercepts kernel launch arguments to forecast memory requirements and migrate working sets before the context switch occurs.^11^

---

## The Dual-LLM Adversarial Framework for High-Confidence Extraction

To maintain a single source of truth, the data rehydrated into the system must be of the highest reliability. Single-pass LLM extraction is prone to "contextual hallucinations," where the model confuses similar entities or misinterprets semantic nuances.^12^ The Dual-LLM adversarial framework solves this by introducing a "Verifier" LLM that audits the output of the "Extractor" LLM.^9^

### Iterative Refinement and Semantic Convergence

In this framework, the Extractor generates an initial structured representation (e.g., a JSON object) of the extracted facts. The Verifier then evaluates this output against a domain-specific schema and the existing state of the archive. The Verifier provides "adversarial feedback" — identifying errors, format deviations, or contradictions — which the Extractor uses to refine its output in a closed-loop cycle.^9^ Experimental results indicate that this iterative process significantly improves accuracy, particularly in the "Analyses" dimension, where the model must capture methodological or logical reasoning rather than just literal string matching.^9^

### Schema Optimization and Guardrails

The use of guided LLM pipelines — incorporating techniques like Few-Shot learning, Chain-of-Thought reasoning, and controlled JSON schemas — can raise extraction accuracy from roughly 54.5% to over 93%.^14^ Frameworks such as PARSE further optimize this process by using an "ARCHITECT" component to transform ambiguous field descriptions into precise, context-rich specifications. For instance, a generic "Price" field might be transformed into a detailed specification with range constraints and formatting rules.^15^ This level of precision is essential for ensuring that the rehydrated state is consistent across different narrative voices.

| Component | Role in Extraction | Impact on Data Quality |
|---|---|---|
| **Extractor LLM** | Identifies raw facts from transcript.^13^ | High recall; potentially low precision. |
| **Verifier LLM** | Audits facts against schema and history.^9^ | Detects hallucinations and drift. |
| **ARCHITECT** | Optimizes JSON schema for LLM consumption.^15^ | Reduces semantic misinterpretation. |
| **SCOPE** | Provides grounded reflection and self-correction.^15^ | Ensures outputs match source text. |

---

## Ethical Agency and the "Co-Production" of Memory

In the context of a digital memoir, the AI is not just a storage medium but a "memory machine" that actively participates in the construction of a user's past. This introduces profound ethical challenges related to agency and the potential for "glitch memories."^6^

### Meaningful Control and the Digital Legacy

As observed in research from the mid-2020s, generative AI has the potential to "untether" the human past from the present by producing memories that were never actually experienced.^6^ This is a particular risk as users age and their mnemonic critical thinking skills may decline. To ensure "Meaningful Control," a production-grade system must implement architectural boundaries that prevent the AI from making autonomous decisions about the user's "Truth."^17^

The "Agency-Preserving AI" model suggests that every AI-proposed change to a digital legacy must be verifiable and reversible. The system should maintain a "shadow archive" of all raw data, allowing a human-in-the-loop (HITL) to audit any "re-mixing" of individual memory performed by the AI.^6^ This ensures that the user — or their designated descendants — maintains sovereignty over their own story.

### Zero-Trust Microservices for Data Isolation

To prevent sensitive personal data from being leaked or corrupted via prompt-injection attacks, a Zero-Trust architecture must be applied to the agentic workflow. This means that "nothing is trusted by default," including internal agent components.^18^ Personal archive data should be segmented into its own "protect surface" with granular access policies.^19^

An AI agent's "reasoning" (deciding what to do) must be strictly decoupled from its "authority" (what it is allowed to do). All interactions with the personal archive should be mediated through a "Tool Gateway" that enforces policy checks and environment isolation.^18^ By sandboxing the agent's actions in lightweight VMs or gVisor-based containers, the system ensures that even if an agent misreasons or is compromised, the "blast radius" is limited and the core data remains secure.^20^

| Security Layer | Operational Implementation | Risk Mitigation |
|---|---|---|
| **Identity** | Scoped, short-lived tokens for each agent task.^18^ | Prevents privilege escalation. |
| **Policy Engine** | Checks tool calls against user permissions.^18^ | Blocks unauthorized data modification. |
| **Sandbox** | Running agent code in gVisor/Kata Containers.^21^ | Isolates host from malicious generation. |
| **Tool Gateway** | Mediated execution of API calls and DB writes.^18^ | Ensures auditability and limits. |
| **Prompt Firewall** | Real-time filtering of PII and injection attempts.^22^ | Protects against adversarial inputs. |

---

## Benchmarking Lorevox: Metrics for a Production-Grade System

To validate the superiority of these advanced methods over a prototype, the system must be instrumented to capture a series of "LLM-Ops" metrics. These metrics move beyond simple accuracy to measure the stability and responsiveness of the entire agentic trajectory.

### Reliability and Drift Metrics

The primary metric for state integrity is the "Extraction Reliability Score," which compares the output of the automated extraction pipeline against a human-expert baseline. A production-grade system should aim for an F1-score above 90%, achievable through schema-guided adversarial loops.^14^ Additionally, "Data Drift" should be monitored using Online Concept Drift Detection (OCDD). This identifies semantic shifts where a field value (e.g., a father's name) changes back-and-forth between narrative sessions, indicating a failure in state isolation or a contradiction in the underlying data.^24^

### Latency and Operational Metrics

For multi-modal systems, user experience is defined by "Time to First Token" (TTFT) and the "Latency Delta" of background tasks. Sequential Hooking and GPU fractioning should be measured by their ability to maintain a consistent TTFT even under high concurrency.^26^ The system's efficiency can be quantified through its "Token Overhead" — the ratio of coordination tokens used for multi-agent synchronization versus tokens used for generating user-facing content.^10^

| Metric | Method of Measurement | Target Baseline |
|---|---|---|
| **Extraction Reliability** | % accuracy vs. Expert Annotation.^14^ | > 93% |
| **Latency Delta** | Time from User Send to UI update. | < 500ms (incremental updates). |
| **Data Drift** | Statistical deviation in field values.^24^ | < 2% (Adversarial/Unresolved). |
| **User Agency Score** | Manual HITL check of ownership perception.^6^ | High (Subjective). |
| **Tool Calling Accuracy** | % of correct function selections.^28^ | > 98% |

---

## Implementation and Research Roadmap

To transition the Lorevox system from its current prototype state, the following implementation sequence is recommended, based on the findings of cutting-edge AI systems research:

1. **Orchestration Hardening**: Implement Sequential Hooking in the interaction controller to resolve immediate GPU timeouts. If this raises extraction success rates from 40% to 90%, it confirms that resource contention was the primary failure mode.^1^

2. **State Re-Architecture**: Migrate from a heterogeneous dictionary-based state to a strict Protobuf/JSON schema model managed by an Event Sourcing journal.^5^ This provides the immutable audit trail necessary for verifying co-produced memories.

3. **Adversarial Refinement Deployment**: Integrate a Dual-LLM framework where a secondary "Verifier" LLM audits all extraction results before they are rehydrated into the state.^9^

4. **Zero-Trust Integration**: Isolate the memoir data storage behind a mediated Tool Gateway, ensuring that chat agents cannot directly modify historical state without a validated policy check.^18^

5. **Continuous Monitoring**: Deploy a causal trace architecture (e.g., Latitude or Openlayer) to cluster issue patterns and detect drift in multi-turn conversations automatically.^28^

By adopting these specialized architectural patterns, multi-modal systems can overcome the inherent limitations of current LLM-Ops. The integration of advanced GPU scheduling, adversarial data verification, and agency-preserving ethical frameworks transforms an "experimental prototype" into a robust, secure, and human-centric "memory machine" capable of supporting digital legacies for the long term. This rigorous approach ensures that the "Single Source of Truth" is not just a technical aspiration but a reliable foundation for human identity in the age of AI.

---

## Synthesis of Distributed Systems and Agentic Paradigms

The convergence of distributed systems theory (CRDTs, Event Sourcing) with modern agentic AI (Dual-LLM, MIG, Zero-Trust) represents the next frontier of software engineering. For a system like Lorevox, which sits at the intersection of private memory and autonomous reasoning, the stakes are uniquely high. The research indicates that failure in these systems is rarely a result of a "weak" LLM, but rather a failure of the architecture to provide the LLM with a consistent, isolated, and appropriately prioritized environment.^11^

The transition to production-grade reliability therefore requires a holistic commitment to architectural discipline. By treating every turn of dialogue as an event in a persistent journal and every GPU cycle as a finite resource to be scheduled, we can build systems that do not just "hallucinate" a version of the user's past, but faithfully preserve it. This alignment of technical rigor and ethical agency is what will ultimately define the success of digital legacy platforms in the coming decade.

The "Concurrency-Coherence Paradox" is not an unsolvable problem but an engineering constraint that dictates the move toward asynchronous, decoupled, and adversarial architectures. As these technologies mature, the distinction between "human-recorded" and "AI-assisted" memory will continue to blur, making the integrity of the "Single Source of Truth" the most vital component of our digital infrastructure. This research framework provides the necessary benchmarking and implementation pathway to ensure that this integrity is maintained against the challenges of asynchronous inputs and conflicting data streams.

By grounding the Lorevox architecture in these principles, the system will move beyond simple chat interactions to become a reliable, expert-grade platform for the co-production of human memory. The evidence suggests that a commitment to these "Better Methods" — Sequential Hooking, Event Sourcing, and Zero-Trust isolation — is the only way to achieve the scalability and security required for a production-grade personal archiving system in 2026 and beyond.

---

## Works Cited

1. AgoraAI: An Open-Source Voice-to-Voice Framework for Multi-Persona and Multi-Human Interaction — MDPI. [https://www.mdpi.com/2076-3417/16/4/2120](https://www.mdpi.com/2076-3417/16/4/2120)

2. Strong Eventual Consistency — The Big Idea Behind CRDTs | Hacker News. [https://news.ycombinator.com/item?id=45177518](https://news.ycombinator.com/item?id=45177518)

3. Memory models :: Akka Documentation. [https://doc.akka.io/concepts/state-model.html](https://doc.akka.io/concepts/state-model.html)

4. November 2025 — Shahzad Bhatti. [https://weblog.plexobject.com/archives/date/2025/11](https://weblog.plexobject.com/archives/date/2025/11)

5. Event Sourcing with Apache Kafka — TIMETOACT GROUP. [https://www.timetoact-group.at/en/techblog/techblog/event-sourcing-with-apache-kafka](https://www.timetoact-group.at/en/techblog/techblog/event-sourcing-with-apache-kafka)

6. AI and memory | Memory, Mind & Media | Cambridge Core. [https://www.cambridge.org/core/journals/memory-mind-and-media/article/ai-and-memory/BB2E4B113B826133E1B6C8DB6BACD192](https://www.cambridge.org/core/journals/memory-mind-and-media/article/ai-and-memory/BB2E4B113B826133E1B6C8DB6BACD192)

7. From Single to Multi-Agent Systems: Key Infrastructure Needs | DigitalOcean. [https://www.digitalocean.com/community/tutorials/single-to-multi-agent-infrastructure](https://www.digitalocean.com/community/tutorials/single-to-multi-agent-infrastructure)

8. Enterprise Agentic AI Architecture Design Guidance — Part 2. [https://www.architectureandgovernance.com/applications-technology/enterprise-agentic-ai-architecture-design-guidance-part-2/](https://www.architectureandgovernance.com/applications-technology/enterprise-agentic-ai-architecture-design-guidance-part-2/)

9. Dual-LLM Adversarial Framework for Information Extraction from Research Literature. [https://www.biorxiv.org/content/10.1101/2025.09.11.675507v1.full-text](https://www.biorxiv.org/content/10.1101/2025.09.11.675507v1.full-text)

10. Multi-Agent AI Systems: Architecture, Communication, and Coordination — Prem AI. [https://blog.premai.io/multi-agent-ai-systems-architecture-communication-and-coordination/](https://blog.premai.io/multi-agent-ai-systems-architecture-communication-and-coordination/)

11. Towards Fully-fledged GPU Multitasking via Proactive Memory Management — arXiv. [https://arxiv.org/pdf/2512.24637](https://arxiv.org/pdf/2512.24637)

12. Expert-Grounded Automatic Prompt Engineering for Extracting Lattice Constants — ResearchGate. [https://www.researchgate.net/publication/398723353](https://www.researchgate.net/publication/398723353)

13. Dual-LLM Adversarial Framework for Information Extraction from Research Literature. [https://www.biorxiv.org/content/10.1101/2025.09.11.675507v1](https://www.biorxiv.org/content/10.1101/2025.09.11.675507v1)

14. LLM-assisted Data Structuring and Analysis for Improving Aircraft Maintenance — reposiTUm. [https://repositum.tuwien.at/bitstream/20.500.12708/226890/1/](https://repositum.tuwien.at/bitstream/20.500.12708/226890/1/)

15. PARSE: LLM Driven Schema Optimization for Reliable Entity Extraction — arXiv. [https://arxiv.org/html/2510.08623v1](https://arxiv.org/html/2510.08623v1)

16. Unreliable Past: Constructing Memory with Generative AI — R Discovery. [https://discovery.researcher.life/article/unreliable-past-constructing-memory-with-generative-ai/aec779a3a3fa3c78bb2427cf585352af](https://discovery.researcher.life/article/unreliable-past-constructing-memory-with-generative-ai/aec779a3a3fa3c78bb2427cf585352af)

17. AI and memory — ResearchGate. [https://www.researchgate.net/publication/383947931_AI_and_MEMORY](https://www.researchgate.net/publication/383947931_AI_and_MEMORY)

18. Zero Trust Agentic AI Architecture: Designing Autonomy Behind Guardrails. [https://dev.to/dev_gupta_6707a7dccdfd729/zero-trust-agentic-ai-designing-autonomy-behind-guardrails-c2l](https://dev.to/dev_gupta_6707a7dccdfd729/zero-trust-agentic-ai-designing-autonomy-behind-guardrails-c2l)

19. Zero trust: Why it matters and how to implement | Solo.io. [https://www.solo.io/topics/security-and-compliance/zero-trust](https://www.solo.io/topics/security-and-compliance/zero-trust)

20. Implementing Zero-Trust Architecture for AI Systems — NexaStack. [https://www.nexastack.ai/blog/zero-trust-architecture-ai-systems](https://www.nexastack.ai/blog/zero-trust-architecture-ai-systems)

21. Architectures for Agent Systems: A Survey of Isolation, Integration, and Governance. [https://medium.com/@yunwei356/architectures-for-agent-systems-a-survey-of-isolation-integration-and-governance-59224d26e666](https://medium.com/@yunwei356/architectures-for-agent-systems-a-survey-of-isolation-integration-and-governance-59224d26e666)

22. Zero Trust Agentic AI Security | AccuKnox. [https://accuknox.com/wp-content/uploads/Zero_Trust_Agentic_AI_Security_eBook.pdf](https://accuknox.com/wp-content/uploads/Zero_Trust_Agentic_AI_Security_eBook.pdf)

23. LLM-Assisted Incident Coding for UAS Safety — Preprints.org. [https://www.preprints.org/manuscript/202602.0324](https://www.preprints.org/manuscript/202602.0324)

24. Domain Knowledge-Enhanced LLMs for Fraud and Concept Drift — MDPI. [https://www.mdpi.com/2079-9292/15/3/534](https://www.mdpi.com/2079-9292/15/3/534)

25. Drift-Based Dataset Stability Benchmark — arXiv. [https://arxiv.org/html/2512.23762v1](https://arxiv.org/html/2512.23762v1)

26. Production-ready agentic AI: evaluation, monitoring, and governance | DataRobot Blog. [https://www.datarobot.com/blog/production-ready-agentic-ai-evaluation-monitoring-governance/](https://www.datarobot.com/blog/production-ready-agentic-ai-evaluation-monitoring-governance/)

27. An LLM–BERT and Complex Network Framework for Construction Accident Causation Analysis — MDPI. [https://www.mdpi.com/2075-5309/16/7/1298](https://www.mdpi.com/2075-5309/16/7/1298)

28. LLM Evaluation Metrics Guide (March 2026) — Openlayer. [https://www.openlayer.com/blog/post/llm-evaluation-metrics-complete-guide](https://www.openlayer.com/blog/post/llm-evaluation-metrics-complete-guide)

29. Best AI Evaluation Tools for Agents in 2026: Agent-First vs LLM-Only Platforms | Latitude. [https://latitude.so/blog/agent-first-comparison-guide-vs-braintrust](https://latitude.so/blog/agent-first-comparison-guide-vs-braintrust)
