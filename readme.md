# D&D 5E Character Sheet PDF Editor

A browser-based tool for filling D&D 5E character sheets with direct overlay editing, image uploads, and live preview. Runs entirely client-side - no server required.

## Features

- **Direct PDF editing** - Click and type directly on form field overlays
- **Auto font sizing** - Text automatically scales to fit each field
- **Per-field styling** - Custom font size, color, alignment, bold/italic per field
- **Image uploads** - Add character portraits and faction symbols
- **Page caching** - Fast rendering with cached page images
- **JSON import/export** - Save and load character data
- **Dark mode** - System-aware theme toggle
- **Responsive design** - Works on tablet and mobile screens
- **Debug mode** - Visualize field boundaries

## Usage

### Quick Start

1. Open `index.html` in a modern browser
2. Click **"Load Sample D&D Sheet"** or upload your own fillable PDF
3. Click any field on the PDF and start typing
4. Click **Download** to save your filled PDF

### Editing Methods

| Method             | How                                                 |
| ------------------ | --------------------------------------------------- |
| **Direct editing** | Click any field overlay on the PDF                  |
| **JSON editing**   | Edit in the JSON panel (changes sync automatically) |
| **Image upload**   | Click 🖼️ fields in the sidebar                      |

### Per-Field Styling

Select a field and use the formatting toolbar:

- Font size (Auto-calculated or manual 1-36pt)
- Text alignment (left/center/right)
- Bold and italic styles
- Text color picker

Styles are saved in the `_styles` object in your JSON and applied to the exported PDF.

### JSON Format

```json
{
  "CharacterName": "Elara Moonwhisper",
  "ClassLevel": "Druid 5",
  "Race ": "Wood Elf",
  "STR": "10",
  "Check Box 25": true,
  "_styles": {
    "CharacterName": { "fontSize": 14, "align": "center", "bold": true }
  }
}
```

> **Note**: Some field names have trailing spaces (e.g., `"Race "`, `"Stealth "`). Click fields in the sidebar to auto-add with correct names.

## Project Structure

```
dndpdffiller/
├── index.html                      # Main HTML
├── src/
│   ├── app.js                      # Application logic
│   └── styles.css                  # Styles with CSS variables & dark mode
├── 5E_CharacterSheet_Fillable.pdf  # Sample character sheet
├── dnd_5e_schema.json              # Field reference schema
└── system_prompt.md                # AI prompt for character generation
```

## Dependencies (CDN)

| Library                                     | Version  | Purpose                              |
| ------------------------------------------- | -------- | ------------------------------------ |
| [pdf-lib](https://pdf-lib.js.org/)          | 1.17.1   | PDF manipulation & export            |
| [pdf.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | PDF rendering                        |
| [CodeMirror](https://codemirror.net/)       | 5.65.16  | JSON editor with syntax highlighting |
| [Tailwind CSS](https://tailwindcss.com/)    | 3.x      | UI styling                           |

## Browser Support

- Chrome / Edge (recommended)
- Firefox
- Safari

## Tips

- **Auto font size**: Leave font size on "Auto" to let text scale automatically
- **Checkboxes**: Use `true`/`false` in JSON
- **Debug mode**: Shows field boundaries (red = text, orange = checkbox)
- **Verify Export**: Preview filled PDF in new tab before downloading
- **Copy Field List**: Export all field names as CSV for reference

## License

See [LICENSE](LICENSE) file.
