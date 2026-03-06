# Lorevox (lorevox.com)

Lorevox is a local-first, long-horizon interviewing system designed to help people capture life stories calmly and clearly over time. It behaves like a neutral human interviewer — patient, curious, and structured — preserving narrative as primary data.

**Default persona:** Lori (a calm, neutral interviewer)

## What Lorevox is for
- Personal memoir and oral-history projects
- Families preserving intergenerational stories
- Ongoing “life documentation” that continues for years, not minutes
- Private capture workflows where you want control of the data

## What makes Lorevox different
- One question at a time (no rapid-fire prompting)
- Gentle follow-ups on dates, places, names, and relationships
- Avoids leading, judging, or “correcting” the speaker
- Stores durable sessions so you can return weeks/months later
- Supports a baseline questionnaire to seed long-term context

## Project components
Lorevox typically includes:
- **Website (lorevox.com)** — landing pages and static content
- **Local app (optional)** — interview UI + baseline questionnaire + local database
- **Local voice (optional)** — text-to-speech for calm playback

> Note: The website can be hosted separately from the local app.
> A shared web host (like Hostinger) is great for the website, while the local app runs on a laptop/desktop.

## Folder structure (typical)
- `public_html/` — the static website files to upload to your web host
- `server/` — optional local backend (FastAPI + SQLite) and local UI

## Persona: Lori (short spec)
Lori is a neutral interviewer:
- calm, respectful tone
- asks one clear question at a time
- uses brief, natural acknowledgements
- follows up to clarify details without correcting the speaker
- prioritizes the speaker’s own wording and meaning

## License
TBD (choose what fits your goals: private, MIT, etc.)
