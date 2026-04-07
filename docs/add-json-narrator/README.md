# Adding a JSON Narrator to Lorevox

This guide walks through the complete process of creating a narrator template, loading it into Lorevox, and verifying it works. This is the fastest way to populate a narrator with biographical data rather than filling in the Bio Builder manually.

---

## Overview

Lorevox stores each narrator as a **person** with a profile, questionnaire (Bio Builder data), and relationship graph. The preload system lets you define all of this in a single JSON file and load it in one step. The JSON template maps directly to the Bio Builder sections you see in the UI.

**What gets created when you preload a narrator:**

1. A new person record (via `POST /api/people`)
2. A saved profile with basics, kinship, and pets (via `PUT /api/person/{pid}/profile`)
3. A Bio Builder questionnaire with all sections populated (via `PUT /api/bio-builder/questionnaire`)
4. A relationship graph built from the family data
5. A timeline spine initialized for the Life Story

---

## Step 1: Create the JSON Template

### 1.1 Start from the blank template

Copy `ui/templates/narrator-template.json` to a new file:

```
cp ui/templates/narrator-template.json ui/templates/firstname-lastname.json
```

Use kebab-case for the filename (e.g., `kent-james-horne.json`).

### 1.2 Template structure

The JSON has three metadata fields plus 15 content sections:

```json
{
  "_template": "Lorevox 8.0 Narrator Preload",
  "_narrator": "Display Name Here",
  "_version": 2,

  "personal":        { ... },
  "parents":         [ ... ],
  "grandparents":    [ ... ],
  "greatGrandparents": [ ... ],
  "siblings":        [ ... ],
  "spouse":          { ... },
  "children":        [ ... ],
  "marriage":        { ... },
  "familyTraditions": [ ... ],
  "pets":            [ ... ],
  "earlyMemories":   { ... },
  "education":       { ... },
  "laterYears":      { ... },
  "hobbies":         { ... },
  "health":          { ... },
  "technology":      { ... },
  "additionalNotes": { ... }
}
```

All sections are optional. Empty strings are fine for unknown fields. Arrays can have zero or many entries.

### 1.3 Fill in the personal section

This is the only section where data is truly required (at minimum `fullName`):

```json
"personal": {
  "fullName": "Kent James Horne",
  "preferredName": "Kent",
  "legalFirstName": "Kent",
  "legalMiddleName": "James",
  "legalLastName": "Horne",
  "dateOfBirth": "1939-12-24",
  "timeOfBirth": "",
  "placeOfBirth": "Stanley, North Dakota",
  "birthOrder": "2",
  "zodiacSign": "Capricorn",
  "pronouns": "he/him",
  "culture": "North Dakota",
  "country": "US",
  "language": "English"
}
```

**Date format:** Always use ISO 8601 (`YYYY-MM-DD`). Time uses 24-hour format (`HH:MM`).

**Birth order:** Can be a number (`"2"`) or text (`"second of three children"`). The system normalizes it automatically.

### 1.4 Fill in parents (array)

Each parent is an object in the array. Use `"relation"` values of `"Mother"`, `"Father"`, `"Stepmother"`, `"Stepfather"`, or `"Guardian"`.

```json
"parents": [
  {
    "relation": "Father",
    "firstName": "Ervin",
    "middleName": "",
    "lastName": "Horne",
    "maidenName": "",
    "birthDate": "1909-11-12",
    "birthPlace": "North Dakota",
    "occupation": "",
    "deceased": true,
    "notableLifeEvents": "Long narrative text about the parent's life...",
    "notes": "Short reference notes."
  }
]
```

The `notableLifeEvents` field is where rich biographical narrative goes. Multiple sentences are encouraged. This is what Lori uses to generate Life Story content.

### 1.5 Fill in grandparents (array)

Grandparents use a `"side"` field to indicate lineage:

```json
"grandparents": [
  {
    "side": "paternal",
    "firstName": "George",
    "lastName": "Horne",
    "maidenName": "",
    "birthDate": "1875-03-19",
    "birthPlace": "",
    "ancestry": "American",
    "culturalBackground": "North Dakota homesteader",
    "memorableStories": "Narrative about this grandparent..."
  }
]
```

Valid `side` values: `"paternal"`, `"maternal"`.

### 1.6 Fill in great-grandparents (array, optional)

Same structure as grandparents but with compound `side` values:

```json
"greatGrandparents": [
  {
    "side": "paternal-paternal",
    "firstName": "John Michael",
    "lastName": "Shong",
    "maidenName": "",
    "ancestry": "French (Alsace-Lorraine)",
    "memorableStories": "Narrative..."
  }
]
```

Valid `side` values: `"paternal-paternal"`, `"paternal-maternal"`, `"maternal-paternal"`, `"maternal-maternal"`.

### 1.7 Fill in siblings (array)

```json
"siblings": [
  {
    "relation": "Sister",
    "firstName": "Sharon",
    "middleName": "",
    "lastName": "Woodmansee",
    "maidenName": "Horne",
    "birthOrder": "1",
    "uniqueCharacteristics": "",
    "sharedExperiences": "Grew up together in North Dakota",
    "memories": "",
    "notes": "Born April 8, 1937. Married Ed Woodmansee.",
    "deceased": false
  }
]
```

Valid `relation` values: `"Brother"`, `"Sister"`. Qualifiers like `"Older Brother"` or `"Twin Sister"` also work.

### 1.8 Fill in spouse (object)

```json
"spouse": {
  "firstName": "Janice",
  "middleName": "Josephine",
  "lastName": "Horne",
  "maidenName": "Zarr",
  "birthDate": "1939-09-30",
  "birthPlace": "Spokane, Washington",
  "occupation": "Homemaker",
  "narrative": "Rich biographical text about the spouse...",
  "deceased": false
}
```

### 1.9 Fill in children (array)

```json
"children": [
  {
    "firstName": "Christopher",
    "middleName": "Todd",
    "lastName": "Horne",
    "birthDate": "1962-12-24",
    "narrative": "Third son, born in Williston, North Dakota."
  }
]
```

### 1.10 Fill in remaining sections

The rest of the sections are single objects with string values:

- **marriage** — `proposalStory`, `weddingDetails`
- **familyTraditions** — array of `{ description, occasion }`
- **pets** — array of `{ name, species, breed, birthDate, adoptionDate }`
- **earlyMemories** — `firstMemory`, `favoriteToy`, `significantEvent`
- **education** — `schooling`, `higherEducation`, `earlyCareer`, `careerProgression`, `communityInvolvement`, `mentorship`
- **laterYears** — `retirement`, `lifeLessons`, `adviceForFutureGenerations`
- **hobbies** — `hobbies`, `worldEvents`, `personalChallenges`, `travel`
- **health** — `healthMilestones`, `lifestyleChanges`, `wellnessTips`
- **technology** — `firstTechExperience`, `favoriteGadgets`, `culturalPractices`
- **additionalNotes** — `unfinishedDreams`, `messagesForFutureGenerations`

---

## Step 2: Validate the JSON

Before loading, make sure the JSON is valid. A single missing comma or quote will cause the load to fail silently.

### Option A: Command line

```bash
python3 -c "import json; json.load(open('ui/templates/your-narrator.json')); print('Valid')"
```

### Option B: Browser console

Open `lori9.0.html` in Chrome, open DevTools (F12), and paste:

```javascript
fetch('/ui/templates/your-narrator.json')
  .then(r => r.json())
  .then(d => console.log('Valid JSON, narrator:', d._narrator))
  .catch(e => console.error('Invalid JSON:', e));
```

### Common validation issues

- Trailing commas after the last item in an array or object
- Missing commas between fields
- Unescaped quotes inside string values (use `\"` or single quotes in narrative text)
- Using `null` instead of `""` for empty fields (either works, but empty strings are preferred)

---

## Step 3: Load the Narrator into Lorevox

### Prerequisites

1. Lorevox backend is running (the API server at `localhost:8080`)
2. `lori9.0.html` is open in Chrome at `http://localhost:8080/ui/lori9.0.html`
3. The JSON template file is in the `ui/templates/` directory

### Method A: Browser console (recommended for single narrators)

1. Open Chrome and navigate to `http://localhost:8080/ui/lori9.0.html`
2. Open DevTools console (F12 or Cmd+Option+J / Ctrl+Shift+J)
3. Run:

```javascript
(async () => {
  const resp = await fetch('/ui/templates/your-narrator.json');
  const tpl = await resp.json();
  const pid = await lv80PreloadNarrator(tpl);
  console.log('Created narrator with person ID:', pid);
})();
```

4. You should see system messages in the chat area confirming the load:
   - "Profile saved."
   - "Timeline spine initialized -- Pass 2A (Timeline Walk) ready."
   - "Preloaded: [Narrator Name]"

### Method B: Claude in Chrome (recommended for automation)

If you have the Claude in Chrome extension installed, you can ask Claude to load narrators using the JavaScript execution tool. This is how we loaded three narrators in a single session:

1. Make sure Lorevox is open in a Chrome tab at `http://localhost:8080/ui/lori9.0.html`
2. In Claude (Cowork mode or Claude in Chrome), use the JavaScript tool:

```javascript
(async () => {
  const resp = await fetch('/ui/templates/kent-james-horne.json');
  const tpl = await resp.json();
  const result = await lv80PreloadNarrator(tpl);
  return result;  // Returns the person ID
})()
```

3. Claude can run this for each narrator template sequentially. Each call returns a UUID person ID on success.

### Method C: File upload via JavaScript

If your template is not served by the web server, you can load it from a local file:

```javascript
// Create a hidden file input and trigger it
const input = document.createElement('input');
input.type = 'file';
input.accept = '.json';
input.onchange = (e) => lv80PreloadFromFile(e.target.files[0]);
input.click();
```

This opens a file picker dialog. Select your JSON file and it will be loaded automatically.

### Method D: Load multiple narrators in batch

```javascript
(async () => {
  const files = [
    'kent-james-horne.json',
    'janice-josephine-horne.json',
    'christopher-todd-horne.json'
  ];
  for (const f of files) {
    const resp = await fetch('/ui/templates/' + f);
    const tpl = await resp.json();
    const pid = await lv80PreloadNarrator(tpl);
    console.log(`Loaded ${tpl._narrator} -> ${pid}`);
  }
})();
```

---

## Step 4: Verify the Narrator

### 4.1 Check the Narrators panel

Click the narrator card/dropdown at the top of the page. You should see your new narrator listed with their name, birth date, birth place, and calculated age. The badge should say "REAL".

### 4.2 Open the narrator and check Bio Builder

1. Click "Open" on the narrator card
2. Click the "Bio Builder" tab
3. Verify each section has the data you entered:
   - Personal Information (name, DOB, birth place)
   - Parents (names, life events, notes)
   - Grandparents (names, ancestry, stories)
   - Siblings, Spouse, Children
   - Education, Career, etc.

### 4.3 Check the Life Map

Click "Life Map" to see the relationship graph. Family members from the template should appear as connected nodes.

### 4.4 Check the API directly

You can verify data was stored correctly via the API:

```bash
# List all people
curl http://localhost:8080/api/people

# Get a specific person's profile
curl http://localhost:8080/api/person/{person_id}/profile

# Get the bio-builder questionnaire
curl http://localhost:8080/api/bio-builder/questionnaire?person_id={person_id}
```

### 4.5 Common issues

**Narrator doesn't appear:** Check the browser console (F12) for errors. The most common cause is invalid JSON or the API server not running.

**Data is missing from Bio Builder:** The preload function maps template fields to questionnaire sections. If a field name doesn't match the expected schema, it will be silently skipped. Compare your template against `narrator-template.json` for correct field names.

**Duplicate narrators:** Each call to `lv80PreloadNarrator()` creates a NEW person. If you run it twice with the same template, you get two copies. Use `lv80PreloadIntoExisting(pid, tpl)` to update an existing narrator instead.

**Profile saved but no timeline:** The timeline spine initializes automatically after preload. If it doesn't appear, try refreshing the page and reopening the narrator.

---

## Step 5: Update an Existing Narrator

If you need to update a narrator that's already loaded (e.g., after editing the JSON template):

```javascript
(async () => {
  const pid = 'existing-person-uuid-here';  // From the narrator card or API
  const resp = await fetch('/ui/templates/updated-template.json');
  const tpl = await resp.json();
  await lv80PreloadIntoExisting(pid, tpl);
  console.log('Updated narrator:', pid);
})();
```

This overwrites the profile and questionnaire data for that person without creating a duplicate.

---

## Reference: Complete Field Map

### Metadata fields (not loaded into Bio Builder)

| Field | Purpose |
|-------|---------|
| `_template` | Version identifier string |
| `_narrator` | Display name shown in preload confirmation |
| `_version` | Schema version number (currently 2) |

### All content fields

| Section | Field | Type | Notes |
|---------|-------|------|-------|
| personal | fullName | string | Required (minimum) |
| personal | preferredName | string | Nickname or short name |
| personal | legalFirstName | string | |
| personal | legalMiddleName | string | |
| personal | legalLastName | string | |
| personal | dateOfBirth | string | YYYY-MM-DD format |
| personal | timeOfBirth | string | HH:MM 24-hour format |
| personal | placeOfBirth | string | City, State |
| personal | birthOrder | string | Number or text |
| personal | zodiacSign | string | |
| personal | pronouns | string | e.g., he/him |
| personal | culture | string | Cultural/ethnic background |
| personal | country | string | Default: "US" |
| personal | language | string | |
| parents[] | relation | string | Mother, Father, Stepmother, Stepfather, Guardian |
| parents[] | firstName | string | |
| parents[] | middleName | string | |
| parents[] | lastName | string | |
| parents[] | maidenName | string | |
| parents[] | birthDate | string | YYYY-MM-DD |
| parents[] | birthPlace | string | |
| parents[] | occupation | string | |
| parents[] | deceased | boolean | |
| parents[] | notableLifeEvents | string | Rich narrative text |
| parents[] | notes | string | Short reference notes |
| grandparents[] | side | string | paternal, maternal |
| grandparents[] | firstName | string | |
| grandparents[] | lastName | string | |
| grandparents[] | maidenName | string | |
| grandparents[] | birthDate | string | YYYY-MM-DD |
| grandparents[] | birthPlace | string | |
| grandparents[] | ancestry | string | |
| grandparents[] | culturalBackground | string | |
| grandparents[] | memorableStories | string | Rich narrative text |
| greatGrandparents[] | side | string | paternal-paternal, etc. |
| greatGrandparents[] | firstName | string | |
| greatGrandparents[] | lastName | string | |
| greatGrandparents[] | maidenName | string | |
| greatGrandparents[] | ancestry | string | |
| greatGrandparents[] | memorableStories | string | Rich narrative text |
| siblings[] | relation | string | Brother, Sister |
| siblings[] | firstName | string | |
| siblings[] | middleName | string | |
| siblings[] | lastName | string | |
| siblings[] | maidenName | string | |
| siblings[] | birthOrder | string | |
| siblings[] | uniqueCharacteristics | string | |
| siblings[] | sharedExperiences | string | |
| siblings[] | memories | string | |
| siblings[] | notes | string | |
| siblings[] | deceased | boolean | |
| spouse | firstName | string | |
| spouse | middleName | string | |
| spouse | lastName | string | |
| spouse | maidenName | string | |
| spouse | birthDate | string | YYYY-MM-DD |
| spouse | birthPlace | string | |
| spouse | occupation | string | |
| spouse | narrative | string | Rich narrative text |
| spouse | deceased | boolean | |
| children[] | firstName | string | |
| children[] | middleName | string | |
| children[] | lastName | string | |
| children[] | birthDate | string | YYYY-MM-DD |
| children[] | narrative | string | |
| marriage | proposalStory | string | |
| marriage | weddingDetails | string | |
| familyTraditions[] | description | string | |
| familyTraditions[] | occasion | string | |
| pets[] | name | string | |
| pets[] | species | string | Dog, Cat, Horse, etc. |
| pets[] | breed | string | |
| pets[] | birthDate | string | YYYY-MM-DD |
| pets[] | adoptionDate | string | YYYY-MM-DD |
| earlyMemories | firstMemory | string | |
| earlyMemories | favoriteToy | string | |
| earlyMemories | significantEvent | string | |
| education | schooling | string | |
| education | higherEducation | string | |
| education | earlyCareer | string | |
| education | careerProgression | string | |
| education | communityInvolvement | string | |
| education | mentorship | string | |
| laterYears | retirement | string | |
| laterYears | lifeLessons | string | |
| laterYears | adviceForFutureGenerations | string | |
| hobbies | hobbies | string | |
| hobbies | worldEvents | string | |
| hobbies | personalChallenges | string | |
| hobbies | travel | string | |
| health | healthMilestones | string | |
| health | lifestyleChanges | string | |
| health | wellnessTips | string | |
| technology | firstTechExperience | string | |
| technology | favoriteGadgets | string | |
| technology | culturalPractices | string | |
| additionalNotes | unfinishedDreams | string | |
| additionalNotes | messagesForFutureGenerations | string | |

---

## Reference: API Endpoints Used by Preload

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/people` | POST | Create new person record |
| `/api/person/{pid}/profile` | PUT | Save profile (basics, kinship, pets) |
| `/api/bio-builder/questionnaire` | PUT | Save bio-builder questionnaire |
| `/api/graph/{pid}` | PUT | Update relationship graph |

---

## Reference: Key JavaScript Functions

| Function | Purpose |
|----------|---------|
| `lv80PreloadNarrator(templateObj)` | Creates a NEW narrator from a JSON template object. Returns the person ID (UUID). |
| `lv80PreloadIntoExisting(pid, tpl)` | Updates an EXISTING narrator with new template data. Does not create a duplicate. |
| `lv80PreloadFromFile(file)` | Reads a JSON File object (from file input) and calls `lv80PreloadNarrator`. |

Source file: `ui/js/narrator-preload.js`

---

## Example: Full Workflow with Claude in Chrome

This is the workflow used to load the Horne family narrators (Kent, Janice, Christopher) in a single session:

1. **Prepared three JSON templates** in `ui/templates/`:
   - `kent-james-horne.json`
   - `janice-josephine-horne.json`
   - `christopher-todd-horne.json`

2. **Validated all three** via command line:
   ```bash
   for f in kent-james-horne janice-josephine-horne christopher-todd-horne; do
     python3 -c "import json; json.load(open('ui/templates/${f}.json')); print('${f}: OK')"
   done
   ```

3. **Started Lorevox** and opened `http://localhost:8080/ui/lori9.0.html` in Chrome.

4. **Used Claude in Chrome** to execute JavaScript on the page for each narrator:
   ```javascript
   (async () => {
     const resp = await fetch('/ui/templates/kent-james-horne.json');
     const tpl = await resp.json();
     const result = await lv80PreloadNarrator(tpl);
     return result;
   })()
   ```

5. **Verified** by clicking the narrator dropdown and confirming all three appeared with correct names, dates, and birth places. Opened each narrator's Bio Builder to spot-check the data.

The entire process for three narrators took under two minutes.
