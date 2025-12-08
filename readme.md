# Comet PDF Editor - D&D 5E Character Sheet Engine

## Overview
A client-side web application that allows users to fill D&D 5E character sheet PDFs using JSON data, with live preview rendering.

## Features

### PDF Handling
- **Upload**: Upload any fillable PDF form
- **Sample PDF**: Quick-load the official D&D 5E character sheet
- **Download**: Export the filled PDF

### JSON Editor
- **Syntax Highlighting**: CodeMirror-powered editor with Dracula theme
- **Real-time Validation**: Live JSON syntax checking with status indicator
- **Field Discovery**: Click field names in the sidebar to add them to your JSON

### Live Preview
- **Auto-Refresh**: Preview updates when you click out of the JSON editor
- **Zoom Controls**: Manual zoom (+/-) or auto-fit to container width
- **Progress Indicator**: Toast notification shows rendering progress

### Form Field Support
- **Text Fields**: Set values using string properties
- **Checkboxes**: Set values using boolean (`true`/`false`)

## Technical Stack
- **Core**: Native HTML5, JavaScript (ES6+)
- **Styling**: Tailwind CSS (via CDN)
- **PDF Manipulation**: pdf-lib (v1.17.1)
- **PDF Rendering**: pdf.js (v3.11.174)
- **Code Editor**: CodeMirror (v5.65.16 with Dracula theme)

## Usage

### Basic Workflow
1. Load a PDF (upload or use sample)
2. View available field names in the left sidebar
3. Edit JSON data in the center panel
4. Click outside the editor to update preview
5. Download the filled PDF

### JSON Format
```json
{
    "CharacterName": "Elara",
    "ClassLevel": "Druid 1",
    "STR": "10",
    "Check Box 25": true
}
```

### Field Name Reference
The sidebar shows all detected field names from the PDF. Click a field name to automatically add it to your JSON with an empty value.

**Note**: Some D&D 5E sheet fields have trailing spaces in their names (e.g., `"Race "`, `"Stealth "`). Use exact field names from the sidebar.

## Known Limitations
- Font sizing is controlled by the PDF's built-in settings
- Large text boxes may display text at default PDF sizes
- Works best with fillable AcroForm PDFs

## Files
- `main.html` - The complete application (single-file)
- `5E_CharacterSheet_Fillable.pdf` - Sample D&D character sheet (place in same directory)
- `dnd_5e_schema.json` - Reference schema for character data
- `system_prompt.md` - AI prompt for generating character JSON
