# 👻 Ghostwriter

**Ghostwriter** is a local AI fine-tuning toolkit designed to capture your unique writing voice. It uses **Llama 3** (via Unsloth) to learn from your existing work—whether novels, travel memoirs, or screenplays—and turns it into a personalized writing partner.

> **Status:** Super Advanced (Unified Pipeline) 🚀
> **Engine:** Unsloth + Llama 3.1 8B (4-bit)
> **Hardware:** Requires NVIDIA GPU (8GB+ VRAM recommended) on Linux/WSL2.

---

## ✨ Features

* **🧠 Multi-Brain Architecture:** Manage distinct writing styles (Fiction, Memoir, Screenplay) in one place.
* **⚡ Unified Pipeline:** Build datasets and fine-tune models in a single command.
* **📂 Smart Scanning:** Recursively reads `.txt`, `.md`, and `.rtf` files from subfolders.
* **💬 Interactive Chat:** Talk to your fine-tuned models in a CLI chat interface.
* **🚀 Optimized Training:** Uses LoRA adapters and 4-bit quantization for fast, memory-efficient training on consumer GPUs (RTX 3060/4090/5080).

---

## 🛠️ Installation

### 1. System Requirements
* **OS:** WSL2 (Ubuntu 22.04+) or Native Linux.
* **GPU:** NVIDIA RTX series with CUDA 12.1 support.

### 2. Setup
Run the provided setup script to create the environment and install dependencies (Unsloth, PyTorch, etc.).

```bash
# Make the setup script executable
chmod +x setup_ghostwriter.sh

# Run it
./setup_ghostwriter.sh

# Activate the environment
source .venv310/bin/activate

Project Structure
Ghostwriter expects your source text to be organized by "brain" type. The script will create these folders for you if they don't exist.

Plaintext

/ghostwriter
├── ghostwriter.py          # The unified brain manager
├── raw_text_fiction/       # Drop your novels/stories here (.txt, .md)
├── raw_text_memoir/        # Drop your travel logs/diaries here
├── raw_text_screenplay/    # Drop scripts here (.rtf, .txt)
└── models/                 # (Auto-generated) Where your trained brains live
🚀 Usage
1. Prepare Your Data
Simply drop your text files into the corresponding folder.

Writing a novel? Put chapters in raw_text_fiction/.

Documenting a trip? Put journals in raw_text_memoir/.

2. The "One-Click" Pipeline
Use the pipeline mode to build the dataset and train the model in one go.

Train the Memoir Brain:

Bash

python3 ghostwriter.py --mode pipeline --brain memoir
Train the Fiction Brain:

Bash

python3 ghostwriter.py --mode pipeline --brain fiction
(Note: Training takes about 5-15 minutes depending on dataset size and GPU speed.)

3. Chat with Your Ghostwriter
Once training is complete, launch the chat interface to test the voice.

Bash

python3 ghostwriter.py --mode chat --brain memoir
Chat Commands:

Type your prompt to get a response.

Type /exit or /quit to close.

🧪 Advanced Usage
If you want more control, you can run steps individually.

Build Dataset Only: Scans your folders and creates a .jsonl file without training.

Bash

python3 ghostwriter.py --mode build --brain fiction
Train Only: Retrains the model using an existing dataset.

Bash

python3 ghostwriter.py --mode train --brain fiction
Quick Evaluation: Run a single prompt to check the output without entering chat mode.

Bash

python3 ghostwriter.py --mode eval --brain screenplay --prompt "EXT. DESERT HIGHWAY - DAY"
⚙️ Configuration
You can tweak the internal settings by editing ghostwriter.py:

MAX_SEQ: Controls context length (default: 8192).

MAX_STEPS: Increase this (e.g., to 300) if your model isn't learning enough.

MIN_CHARS: Adjust chunking size for your text data.

📜 License
Personal use only. Generated models are derivative works of Llama 3.
