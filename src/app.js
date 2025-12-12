(function() {
    'use strict';

    // ==========================================
    // Storage Manager - Persist user data across reloads
    // ==========================================
    const StorageManager = {
        KEYS: {
            JSON_DATA: 'dndpdf_jsonData',
            IMAGES: 'dndpdf_images',
            PANEL_STATES: 'dndpdf_panelStates',
            ZOOM: 'dndpdf_zoom',
            DARK_MODE: 'dndpdf_darkMode'
        },

        saveTimeout: null,

        // Debounced save - waits 500ms after last call
        scheduleSave(key, data) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = setTimeout(() => {
                this.save(key, data);
                this.showSaveToast();
            }, 500);
        },

        save(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (e) {
                console.warn('Storage save failed:', e);
            }
        },

        load(key, defaultValue = null) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : defaultValue;
            } catch (e) {
                console.warn('Storage load failed:', e);
                return defaultValue;
            }
        },

        saveJsonData(jsonString) {
            this.scheduleSave(this.KEYS.JSON_DATA, jsonString);
        },

        loadJsonData() {
            return this.load(this.KEYS.JSON_DATA, null);
        },

        saveImages(images) {
            this.save(this.KEYS.IMAGES, images);
            this.showSaveToast();
        },

        loadImages() {
            return this.load(this.KEYS.IMAGES, {});
        },

        savePanelStates(states) {
            this.save(this.KEYS.PANEL_STATES, states);
        },

        loadPanelStates() {
            return this.load(this.KEYS.PANEL_STATES, { sidebar: true, toolbar: true, json: true });
        },

        saveZoom(zoom) {
            this.save(this.KEYS.ZOOM, zoom);
        },

        loadZoom() {
            return this.load(this.KEYS.ZOOM, { scale: 1.0, autoFit: true });
        },

        saveDarkMode(isDark) {
            this.save(this.KEYS.DARK_MODE, isDark);
        },

        loadDarkMode() {
            return this.load(this.KEYS.DARK_MODE, false);
        },

        clearAll() {
            Object.values(this.KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
        },

        showSaveToast() {
            let toast = document.getElementById('save-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'save-toast';
                toast.className = 'save-toast';
                toast.textContent = '✓ Saved';
                document.body.appendChild(toast);
            }
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 1500);
        }
    };

let originalPdfBytes = null;
        let pdfDoc = null;
        let currentScale = 1.0;
        let baseRenderScale = 1.5; // Scale at which pages are cached (higher = better quality)
        let isAutoFit = true;
        let isDebugMode = false;
        let resizeTimeout;
        let jsonEditor;
        let fieldMetadata = {}; // Store field positions from pdf-lib
        let fieldImages = {}; // Store uploaded images (base64)
        let cachedPageImages = []; // Store rendered page images as data URLs
        let cachedPageDimensions = []; // Store original page dimensions

        // Friendly display names for cryptic field names
        const FIELD_DISPLAY_NAMES = {
            // Saving Throw Proficiencies
            "Check Box 11": "☐ STR Save Prof",
            "Check Box 12": "☐ DEX Save Prof",
            "Check Box 13": "☐ CON Save Prof",
            "Check Box 14": "☐ INT Save Prof",
            "Check Box 15": "☐ WIS Save Prof",
            "Check Box 16": "☐ CHA Save Prof",

            // Death Saves
            "Check Box 17": "☐ Death Save ✓1",
            "Check Box 18": "☐ Death Save ✓2",
            "Check Box 19": "☐ Death Save ✓3",
            "Check Box 20": "☐ Death Save ✗1",
            "Check Box 21": "☐ Death Save ✗2",
            "Check Box 22": "☐ Death Save ✗3",

            // Skill Proficiencies
            "Check Box 23": "☐ Acrobatics Prof",
            "Check Box 24": "☐ Animal Handling Prof",
            "Check Box 25": "☐ Arcana Prof",
            "Check Box 26": "☐ Athletics Prof",
            "Check Box 27": "☐ Deception Prof",
            "Check Box 28": "☐ History Prof",
            "Check Box 29": "☐ Insight Prof",
            "Check Box 30": "☐ Intimidation Prof",
            "Check Box 31": "☐ Investigation Prof",
            "Check Box 32": "☐ Medicine Prof",
            "Check Box 33": "☐ Nature Prof",
            "Check Box 34": "☐ Perception Prof",
            "Check Box 35": "☐ Performance Prof",
            "Check Box 36": "☐ Persuasion Prof",
            "Check Box 37": "☐ Religion Prof",
            "Check Box 38": "☐ Sleight of Hand Prof",
            "Check Box 39": "☐ Stealth Prof",
            "Check Box 40": "☐ Survival Prof",

            // Image fields
            "CHARACTER IMAGE": "🖼️ Character Portrait",
            "Faction Symbol Image": "🖼️ Faction Symbol",

            // Other fields with trailing spaces or odd names
            "Race ": "Race",
            "DEXmod ": "DEX Modifier",
            "Deception ": "Deception",
            "History ": "History",
            "Investigation ": "Investigation",
            "Perception ": "Perception",
            "Stealth ": "Stealth",
            "PersonalityTraits ": "Personality Traits",
            "CHamod": "CHA Modifier"
        };

        // Image field detection
        const IMAGE_FIELDS = ["CHARACTER IMAGE", "Faction Symbol Image"];

        // Manual page overrides for fields with incorrect automatic detection
        // Page 0 = Stats, Page 1 = Appearance/Backstory, Page 2 = Spellcasting
        const PAGE_OVERRIDES = {
            "CHARACTER IMAGE": 1,
            "Faction Symbol Image": 1,
            "Age": 1,
            "Height": 1,
            "Weight": 1,
            "Eyes": 1,
            "Skin": 1,
            "Hair": 1,
            "Backstory": 1,
            "Allies": 1,
            "FactionName": 1,
            "Treasure": 1,
            "CharacterName 2": 1
        };

        // Style overrides for specific fields to ensure perfect alignment
        const STYLE_OVERRIDES = {
            "AC": { fontSize: 24, align: "center", yOffset: 10 },
            "Initiative": { fontSize: 18, align: "center", yOffset: 0 },
            "Speed": { fontSize: 18, align: "center", yOffset: 0 },
            "STR": { fontSize: 24, align: "center", yOffset: 2 },
            "DEX": { fontSize: 24, align: "center", yOffset: 2 },
            "CON": { fontSize: 24, align: "center", yOffset: 2 },
            "INT": { fontSize: 24, align: "center", yOffset: 2 },
            "WIS": { fontSize: 24, align: "center", yOffset: 2 },
            "CHA": { fontSize: 24, align: "center", yOffset: 2 },
            "STRmod": { fontSize: 12, align: "center" },
            "DEXmod ": { fontSize: 12, align: "center" },
            "CONmod": { fontSize: 12, align: "center" },
            "INTmod": { fontSize: 12, align: "center" },
            "WISmod": { fontSize: 12, align: "center" },
            "CHamod": { fontSize: 12, align: "center" },
            "Passive": { fontSize: 18, align: "center", yOffset: 0 },
            "ProfBonus": { fontSize: 14, align: "center", yOffset: 1 },
            "HPMax": { fontSize: 12, align: "center" },
            "HPCurrent": { fontSize: 24, align: "center" }
        };

        // Field sort order by category (lower = higher priority)
        function getFieldSortPriority(name) {
            // Basic info first
            if (name === "CharacterName" || name === "ClassLevel") return 0;
            if (name === "Race " || name === "Background" || name === "Alignment" || name === "XP") return 1;
            if (name === "PlayerName") return 2;

            // Ability scores
            if (/^(STR|DEX|CON|INT|WIS|CHA)$/.test(name)) return 10;
            if (/mod/.test(name)) return 11;

            // Combat stats
            if (["AC", "Initiative", "Speed", "HPMax", "HPCurrent", "HPTemp", "HD", "HDTotal", "ProfBonus"].includes(name)) return 20;

            // Saving throws (prof first, then mod)
            if (name.startsWith("ST ")) return 30;
            if (/Check Box 1[1-6]/.test(name)) return 31; // Save proficiencies

            // Skills (arranged alphabetically by skill name via display name)
            if (/Check Box (2[3-9]|3[0-9]|40)/.test(name)) return 40; // Skill proficiencies
            if (["Acrobatics", "Animal", "Arcana", "Athletics"].includes(name)) return 41;

            // Death saves
            if (/Check Box (1[7-9]|2[0-2])/.test(name)) return 50;

            // Image fields
            if (IMAGE_FIELDS.includes(name)) return 60;

            // Large text fields
            if (["PersonalityTraits ", "Ideals", "Bonds", "Flaws"].includes(name)) return 70;
            if (["Features and Traits", "ProficienciesLang", "Equipment", "AttacksSpellcasting"].includes(name)) return 71;

            // Spellcasting (page 3)
            if (name.includes("Spell") || name.includes("Slots")) return 100;

            return 80; // Default
        }

        // --- STYLING LOGIC START ---
        let currentSelectedField = null;

        function getStyle(fieldName) {
            let style = {};
            // 1. Start with hardcoded overrides
            if (STYLE_OVERRIDES[fieldName]) {
                style = { ...STYLE_OVERRIDES[fieldName] };
            }

            // 2. Merge user-defined styles from JSON
            try {
                // accessing jsonEditor might be risky if called too early, but usually fine
                if (jsonEditor) {
                    const data = JSON.parse(jsonEditor.getValue());
                    if (data._styles && data._styles[fieldName]) {
                        style = { ...style, ...data._styles[fieldName] };
                    }
                }
            } catch (e) { }

            return style;
        }

        function applyStyle(prop, value) {
            if (!currentSelectedField) return;

            try {
                const data = JSON.parse(jsonEditor.getValue());
                if (!data._styles) data._styles = {};
                if (!data._styles[currentSelectedField]) data._styles[currentSelectedField] = {};

                if (value === null || value === '') {
                    delete data._styles[currentSelectedField][prop];
                    // Clean up if empty
                    if (Object.keys(data._styles[currentSelectedField]).length === 0) {
                        delete data._styles[currentSelectedField];
                    }
                } else {
                    data._styles[currentSelectedField][prop] = value;
                }

                jsonEditor.setValue(JSON.stringify(data, null, 4));
                updateToolbarUI();
                // We need to re-render the preview to show changes
                updatePreview();
            } catch (e) {
                console.error("Error applying style", e);
            }
        }

        function toggleStyle(prop) {
            if (!currentSelectedField) return;
            const currentStyle = getStyle(currentSelectedField);
            const currentValue = currentStyle[prop];
            applyStyle(prop, currentValue ? null : true);
        }

        function updateToolbarUI() {
            const fieldName = currentSelectedField;
            const nameDisplay = document.getElementById('selected-field-name');
            nameDisplay.textContent = fieldName ? (FIELD_DISPLAY_NAMES[fieldName] || fieldName) : "No field selected";

            if (!fieldName) {
                document.getElementById('font-size-select').value = "";
                document.getElementById('text-color-picker').value = "#000000";
                ['btn-bold', 'btn-italic', 'btn-align-left', 'btn-align-center', 'btn-align-right'].forEach(id => {
                    document.getElementById(id).classList.remove('active');
                });
                return;
            }

            const style = getStyle(fieldName);

            document.getElementById('font-size-select').value = style.fontSize || "";
            document.getElementById('text-color-picker').value = style.color || "#000000";

            document.getElementById('btn-bold').classList.toggle('active', !!style.bold);
            document.getElementById('btn-italic').classList.toggle('active', !!style.italic);

            const align = style.align || 'left';
            document.getElementById('btn-align-left').classList.toggle('active', align === 'left');
            document.getElementById('btn-align-center').classList.toggle('active', align === 'center');
            document.getElementById('btn-align-right').classList.toggle('active', align === 'right');
        }
        // --- STYLING LOGIC END ---

        const defaultData = {
            // Basic Info
            "CharacterName": "Elara Silverleaf",
            "ClassLevel": "Druid 5",
            "Background": "Hermit",
            "PlayerName": "Player",
            "Race ": "Wood Elf",
            "Alignment": "Neutral Good",
            "XP": "6500",

            // Ability Scores
            "STR": "10",
            "STRmod": "+0",
            "DEX": "14",
            "DEXmod ": "+2",
            "CON": "12",
            "CONmod": "+1",
            "INT": "13",
            "INTmod": "+1",
            "WIS": "18",
            "WISmod": "+4",
            "CHA": "8",
            "CHamod": "-1",

            // Combat Stats
            "AC": "16",
            "Initiative": "+2",
            "Speed": "35",
            "ProfBonus": "+3",
            "HPMax": "38",
            "HPCurrent": "38",
            "HPTemp": "",
            "HD": "5d8",
            "HDTotal": "5d8",

            // Saving Throws
            "ST Strength": "+0",
            "ST Dexterity": "+2",
            "ST Constitution": "+1",
            "ST Intelligence": "+4",
            "Check Box 14": true,
            "ST Wisdom": "+7",
            "Check Box 15": true,
            "ST Charisma": "-1",

            // Skills
            "Acrobatics": "+2",
            "Animal": "+7",
            "Check Box 24": true,
            "Arcana": "+1",
            "Athletics": "+0",
            "Deception ": "-1",
            "History ": "+1",
            "Insight": "+7",
            "Check Box 29": true,
            "Intimidation": "-1",
            "Investigation ": "+1",
            "Medicine": "+7",
            "Check Box 32": true,
            "Nature": "+4",
            "Check Box 33": true,
            "Perception ": "+7",
            "Check Box 34": true,
            "Performance": "-1",
            "Persuasion": "-1",
            "Religion": "+1",
            "SleightofHand": "+2",
            "Stealth ": "+2",
            "Survival": "+7",
            "Check Box 40": true,

            // Passive Perception
            "Passive": "17",

            // Personality
            "PersonalityTraits ": "I feel tremendous empathy for all who suffer.\nI connect everything that happens to me to a grand cosmic plan.",
            "Ideals": "Greater Good. My gifts are meant to be shared with all, not used for my own benefit.",
            "Bonds": "I entered seclusion to hide from those who might still be hunting me.",
            "Flaws": "I like keeping secrets and won't share them with anyone.",

            // Features & Equipment
            "Features and Traits": "Druidic\nSpellcasting (WIS)\nWild Shape (CR 1/2)\nCircle of the Land (Forest)\nNatural Recovery\nCircle Spells",
            "ProficienciesLang": "Languages: Common, Elvish, Druidic, Sylvan\n\nArmor: Light, medium, shields (no metal)\n\nWeapons: Clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears\n\nTools: Herbalism kit",
            "Equipment": "Wooden shield (+2 AC)\nScimitar\nLeather armor\nDruidic focus (staff)\nExplorer's pack\nHerbalism kit\n23 GP",

            // Attacks
            "AttacksSpellcasting": "Scimitar: +5, 1d6+2 slashing\nProduce Flame: +7, 2d8 fire\nShillelagh: +7, 1d8+4 bludg.\nThunderwave: DC 15, 2d8 thunder",

            // Spellcasting (Page 3)
            "Spellcasting Class 2": "Druid",
            "SpellscastingAbility 2": "WIS",
            "SpellSaveDC  2": "15",
            "SpellAtkBonus 2": "+7",

            // Notes for additional pages
            "Backstory": "Elara spent eight years in isolated seclusion in the heart of an ancient forest, communing with nature spirits and learning the old ways of druidic magic. She emerged when visions warned her of a growing darkness threatening the natural world.",
            "Allies": "Circle of the Ancient Oak - A secretive druid circle that guards sacred groves throughout the realm.",
            "FactionName": "Emerald Enclave",
            "Treasure": "A crystal vial containing water from a sacred spring (worth 50gp)\nA lock of silver hair from a dryad friend"
        };

        // Initialize CodeMirror
        document.addEventListener('DOMContentLoaded', function () {
            // Restore dark mode preference
            const savedDarkMode = StorageManager.loadDarkMode();
            if (savedDarkMode) {
                document.documentElement.classList.add('dark');
                document.getElementById('dark-mode-icon').textContent = '☀';
                const btn = document.getElementById('dark-mode-btn');
                if (btn) btn.setAttribute('aria-pressed', 'true');
            }

            // Load saved images
            fieldImages = StorageManager.loadImages();

            // Initialize CodeMirror JSON editor
            jsonEditor = CodeMirror.fromTextArea(document.getElementById('json-input'), {
                mode: { name: "javascript", json: true },
                theme: "dracula",
                lineNumbers: true,
                lineWrapping: true,
                matchBrackets: true,
                autoCloseBrackets: true,
                tabSize: 4,
                indentWithTabs: false
            });

            // Load saved JSON or default data
            const savedJson = StorageManager.loadJsonData();
            if (savedJson) {
                jsonEditor.setValue(savedJson);
            } else {
                jsonEditor.setValue(JSON.stringify(defaultData, null, 4));
            }

            // Validate and auto-save on changes
            jsonEditor.on('change', function() {
                validateJson();
                StorageManager.saveJsonData(jsonEditor.getValue());
            });
            jsonEditor.on('blur', () => { if (originalPdfBytes) updatePreview(); });
            validateJson();

            // Restore panel states
            const panelStates = StorageManager.loadPanelStates();
            if (!panelStates.sidebar) restorePanelHidden('sidebar');
            if (!panelStates.toolbar) restorePanelHidden('toolbar');
            if (!panelStates.json) restorePanelHidden('json');

            // Restore zoom settings
            const zoomSettings = StorageManager.loadZoom();
            isAutoFit = zoomSettings.autoFit;
            currentScale = zoomSettings.scale;

            // Keyboard shortcuts
            document.addEventListener('keydown', handleKeyboardShortcuts);

            // Try to auto-load default PDF (silently fails if not found)
            autoLoadDefaultPDF();
        });

        function handleKeyboardShortcuts(e) {
            // Ctrl/Cmd + S - Download PDF
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (!document.getElementById('download-btn').disabled) {
                    downloadPDF();
                }
            }
            // Ctrl/Cmd + Shift + S - Verify Export
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                if (!document.getElementById('verify-btn').disabled) {
                    verifyPDF();
                }
            }
            // Escape - Close dropdowns, deselect field
            if (e.key === 'Escape') {
                closeAllDropdowns();
                currentSelectedField = null;
                updateToolbarUI();
            }
        }

        function closeAllDropdowns() {
            document.querySelectorAll('.dropdown-menu.open').forEach(menu => {
                menu.classList.remove('open');
            });
        }

        function restorePanelHidden(panelName) {
            let el, menuItem;
            if (panelName === 'sidebar') {
                el = document.getElementById('sidebar-panel');
                menuItem = document.getElementById('menu-toggle-sidebar');
            } else if (panelName === 'json') {
                el = document.getElementById('json-panel');
                menuItem = document.getElementById('menu-toggle-json');
            } else if (panelName === 'toolbar') {
                el = document.getElementById('formatting-toolbar');
                menuItem = document.getElementById('menu-toggle-toolbar');
            }
            if (el) el.style.display = 'none';
            if (menuItem) menuItem.classList.remove('active');
        }

        // Dropdown menu functions
        function closeAllDropdowns() {
            document.querySelectorAll('.dropdown-container.open').forEach(function(dropdown) {
                dropdown.classList.remove('open');
            });
        }

        function toggleDropdown(dropdownId) {
            const dropdown = document.getElementById(dropdownId);
            const isOpen = dropdown.classList.contains('open');
            
            // Close all dropdowns first
            closeAllDropdowns();
            
            // Toggle this one
            if (!isOpen) {
                dropdown.classList.add('open');
            }
        }

        // Click outside to close dropdowns
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.dropdown-container')) {
                closeAllDropdowns();
            }
        });

        function togglePanelFromDropdown(panelName) {
            togglePanel(panelName);
            
            // Update dropdown item active state
            const menuItem = document.getElementById('menu-toggle-' + panelName);
            const el = panelName === 'sidebar' ? document.getElementById('sidebar-panel') :
                       panelName === 'json' ? document.getElementById('json-panel') :
                       document.getElementById('formatting-toolbar');
            
            if (el && menuItem) {
                const isVisible = el.style.display !== 'none';
                menuItem.classList.toggle('active', isVisible);
            }
        }

        function toggleDebugFromDropdown() {
            toggleDebug();
            const menuItem = document.getElementById('menu-toggle-debug');
            if (menuItem) menuItem.classList.toggle('active', isDebugMode);
        }
        function validateJson() {
            const statusEl = document.getElementById('json-status');
            try {
                JSON.parse(jsonEditor.getValue());
                statusEl.textContent = 'Valid';
                statusEl.className = 'text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400';
                return true;
            } catch (e) {
                statusEl.textContent = 'Invalid';
                statusEl.className = 'text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400';
                return false;
            }
        }

        function loadSampleData() {
            jsonEditor.setValue(JSON.stringify(defaultData, null, 4));
            validateJson();
        }

        async function loadSamplePDF() {
            const btn = document.getElementById('load-sample-btn');
            btn.textContent = 'Loading...';
            btn.disabled = true;
            try {
                const response = await fetch('5E_CharacterSheet_Fillable.pdf');
                if (!response.ok) throw new Error('Local file not found');
                const arrayBuffer = await response.arrayBuffer();
                originalPdfBytes = new Uint8Array(arrayBuffer);
                document.getElementById('file-name-display').textContent = '5E_CharacterSheet_Fillable.pdf';
                document.getElementById('file-name-display').classList.remove('hidden');
                await processPdfBytes();
                btn.textContent = 'Reload Sample';
            } catch (err) {
                console.error('Error loading sample PDF:', err);
                alert('Sample PDF not found locally.\n\nPlease download from:\nhttps://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf\n\nThen place it in the same folder as main.html, or use the Upload button.');
                btn.textContent = 'Load Sample D&D Sheet';
            } finally {
                btn.disabled = false;
            }
        }

        // Silently try to load default PDF on page load
        async function autoLoadDefaultPDF() {
            // Wait a bit to ensure libraries are loaded (helps on slower connections)
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Check if PDF-lib is available
            if (typeof PDFLib === 'undefined') {
                console.log('PDF-lib not ready, skipping auto-load');
                return;
            }
            
            try {
                const response = await fetch('5E_CharacterSheet_Fillable.pdf');
                if (!response.ok) return; // Silently fail
                const arrayBuffer = await response.arrayBuffer();
                originalPdfBytes = new Uint8Array(arrayBuffer);
                document.getElementById('file-name-display').textContent = '5E_CharacterSheet_Fillable.pdf';
                document.getElementById('file-name-display').classList.remove('hidden');
                document.getElementById('load-sample-btn').textContent = 'Reload Sample';
                await processPdfBytes();
            } catch (err) {
                // Silently fail - user can manually load PDF
                console.log('Default PDF not available, user can load manually');
            }
        }

        async function processPdfBytes() {
            // Use pdf-lib to extract field metadata (positions, sizes)
            const pdfLibDoc = await PDFLib.PDFDocument.load(originalPdfBytes.slice());
            const form = pdfLibDoc.getForm();
            const fields = form.getFields();
            const pages = pdfLibDoc.getPages();

            fieldMetadata = {};
            const listContainer = document.getElementById('field-list');
            listContainer.innerHTML = '';

            // Build page annotation map: fieldName -> pageIndex
            // We iterate through each page's annotations and extract field names directly
            const fieldNameToPage = new Map();
            pages.forEach((page, pageIndex) => {
                const annots = page.node.Annots();
                if (annots) {
                    for (let i = 0; i < annots.size(); i++) {
                        try {
                            const annotRef = annots.get(i);
                            // Dereference the annotation to get its dictionary
                            const annotDict = pdfLibDoc.context.lookup(annotRef);
                            if (annotDict && annotDict.get) {
                                // Get the field name from T (text) entry
                                const tValue = annotDict.get(PDFLib.PDFName.of('T'));
                                if (tValue) {
                                    let fieldName = '';
                                    if (tValue.decodeText) {
                                        fieldName = tValue.decodeText();
                                    } else if (tValue.asString) {
                                        fieldName = tValue.asString();
                                    } else {
                                        fieldName = String(tValue);
                                    }
                                    if (fieldName) {
                                        fieldNameToPage.set(fieldName, pageIndex);
                                    }
                                }
                            }
                        } catch (e) { /* ignore individual annotation errors */ }
                    }
                }
            });

            console.log('Field name to page map built with', fieldNameToPage.size, 'entries');
            console.log('Sample entries:', Array.from(fieldNameToPage.entries()).slice(0, 5));

            // Sort fields by category for better UX
            const sortedFields = [...fields].sort((a, b) => {
                const nameA = a.getName();
                const nameB = b.getName();
                const priorityA = getFieldSortPriority(nameA);
                const priorityB = getFieldSortPriority(nameB);
                if (priorityA !== priorityB) return priorityA - priorityB;
                // Within same priority, sort alphabetically by display name
                const displayA = FIELD_DISPLAY_NAMES[nameA] || nameA;
                const displayB = FIELD_DISPLAY_NAMES[nameB] || nameB;
                return displayA.localeCompare(displayB);
            });

            sortedFields.forEach(field => {
                const name = field.getName();
                const type = field.constructor.name;
                const isCheckbox = type === 'PDFCheckBox';

                // Get widget rectangle
                try {
                    const widgets = field.acroField.getWidgets();
                    if (widgets.length > 0) {
                        const widget = widgets[0];
                        const rect = widget.getRectangle();

                        // Find page from our map, with manual overrides for known problem fields
                        let pageIndex = fieldNameToPage.has(name) ? fieldNameToPage.get(name) : 0;

                        // Apply manual page overrides for fields with incorrect detection
                        if (PAGE_OVERRIDES.hasOwnProperty(name)) {
                            pageIndex = PAGE_OVERRIDES[name];
                        }

                        // Debug: log page assignment for troubleshooting
                        if (name.includes('Spells') || name.includes('Backstory') || name.includes('Allies') || name.includes('IMAGE') || name.includes('Symbol')) {
                            console.log(`Field "${name}" assigned to page ${pageIndex} (override: ${PAGE_OVERRIDES.hasOwnProperty(name)})`);
                        }

                        fieldMetadata[name] = {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                            pageIndex: pageIndex,
                            pageHeight: pages[pageIndex].getHeight(),
                            isCheckbox: isCheckbox,
                            isMultiline: rect.height > 25 // Heuristic for multiline
                        };
                    }
                } catch (e) {
                    console.warn('Could not get rect for field:', name);
                }

                // Build field list UI with AI-friendly data attributes
                const displayName = FIELD_DISPLAY_NAMES[name] || name;
                const isImageField = IMAGE_FIELDS.includes(name);

                const div = document.createElement('div');
                div.className = "flex items-center justify-between p-1.5 hover:bg-blue-50 rounded cursor-pointer group transition-colors border-l-2 border-transparent hover:border-blue-400 hover:pl-2 transition-all";
                div.setAttribute('role', 'listitem');
                div.setAttribute('data-field-name', name);
                div.setAttribute('data-field-type', isImageField ? 'image' : (isCheckbox ? 'checkbox' : 'text'));
                div.setAttribute('data-display-name', displayName);

                if (isImageField) {
                    // Image fields trigger file upload
                    div.onclick = () => triggerImageUpload(name);
                    div.setAttribute('aria-label', `Upload image for ${displayName}`);
                    div.setAttribute('data-action', 'upload-image');
                    const dotColor = fieldImages[name] ? 'bg-green-500' : 'bg-purple-400';
                    div.innerHTML = `<div class="flex items-center gap-2 overflow-hidden"><span class="w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0" aria-hidden="true"></span><code class="text-[10px] font-bold text-gray-600 truncate select-all font-mono" title="${name}">${displayName}</code></div>`;
                } else {
                    // Regular fields add to JSON
                    div.onclick = () => addKeyToJSON(name);
                    div.setAttribute('aria-label', `Add ${displayName} to JSON data`);
                    div.setAttribute('data-action', 'add-to-json');
                    const dotColor = isCheckbox ? 'bg-orange-400' : 'bg-blue-400';
                    div.innerHTML = `<div class="flex items-center gap-2 overflow-hidden"><span class="w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0" aria-hidden="true"></span><code class="text-[10px] font-bold text-gray-600 truncate select-all font-mono" title="${name}">${displayName}</code></div>`;
                }
                listContainer.appendChild(div);
            });

            document.getElementById('download-btn').disabled = false;
            document.getElementById('download-btn').classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('download-btn').setAttribute('aria-disabled', 'false');
            document.getElementById('verify-btn').disabled = false;
            document.getElementById('verify-btn').classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('verify-btn').setAttribute('aria-disabled', 'false');
            
            // Cache pages as images, then show with overlays
            await cachePdfPages();
            updateOverlays();
        }

        // Cache all PDF pages as images for fast rendering
        async function cachePdfPages() {
            const toast = document.getElementById('render-toast');
            const statusText = document.getElementById('render-status-text');
            const percentText = document.getElementById('render-percent');
            const progressBar = document.getElementById('render-progress-bar');
            toast.classList.remove('opacity-0');
            progressBar.style.width = '0%';
            percentText.textContent = '0%';
            statusText.textContent = "Caching pages...";

            cachedPageImages = [];
            cachedPageDimensions = [];

            try {
                const loadingTask = pdfjsLib.getDocument({ data: originalPdfBytes.slice(), disableWorker: true });
                const pdf = await loadingTask.promise;
                const totalPages = pdf.numPages;

                for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                    statusText.textContent = `Caching Page ${pageNum}/${totalPages}`;
                    const percent = Math.round(((pageNum - 0.5) / totalPages) * 100);
                    progressBar.style.width = `${percent}%`;
                    percentText.textContent = `${percent}%`;

                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: baseRenderScale });
                    
                    // Store original dimensions (at scale 1)
                    const originalViewport = page.getViewport({ scale: 1 });
                    cachedPageDimensions.push({
                        width: originalViewport.width,
                        height: originalViewport.height
                    });

                    // Render to canvas
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    
                    // Convert to data URL and cache
                    cachedPageImages.push(canvas.toDataURL('image/png'));
                }

                // Calculate initial scale based on container
                const containerW = document.getElementById('pdf-container').clientWidth;
                if (cachedPageDimensions.length > 0 && containerW > 100) {
                    currentScale = (containerW - 64) / cachedPageDimensions[0].width;
                }
                document.getElementById('zoom-level').textContent = Math.round(currentScale * 100) + "%";
                document.getElementById('zoom-slider').value = Math.min(300, Math.max(10, Math.round(currentScale * 100)));

                console.log(`Cached ${totalPages} pages at ${baseRenderScale}x scale`);
                statusText.textContent = "Complete";
                progressBar.style.width = '100%';
                percentText.textContent = '100%';
            } catch (error) {
                console.error('Error caching pages:', error);
                statusText.textContent = "Error";
            } finally {
                setTimeout(() => { toast.classList.add('opacity-0'); }, 800);
            }
        }

        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => { if (isAutoFit && originalPdfBytes) updatePreview(); }, 100);
        });

        function toggleAutoFit() {
            isAutoFit = !isAutoFit;
            document.getElementById('btn-autofit').className = isAutoFit
                ? 'ml-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded border border-blue-200 font-medium'
                : 'ml-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded border border-gray-200 font-medium';
            StorageManager.saveZoom({ scale: currentScale, autoFit: isAutoFit });
            updatePreview();
        }

        function updateZoomLabel(value) {
            document.getElementById('zoom-level').textContent = value + "%";
        }

        function applyZoom(value) {
            isAutoFit = false;
            document.getElementById('btn-autofit').className = 'ml-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded border border-gray-200 font-medium dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
            currentScale = parseInt(value) / 100;
            StorageManager.saveZoom({ scale: currentScale, autoFit: isAutoFit });
            updatePreview();
        }

        function toggleDebug() {
            isDebugMode = !isDebugMode;
            const menuItem = document.getElementById('menu-toggle-debug');
            if (menuItem) {
                menuItem.classList.toggle('active', isDebugMode);
            }
            updatePreview();
        }

        function toggleDarkMode() {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            document.getElementById('dark-mode-icon').textContent = isDark ? '☀' : '🌙';
            const btn = document.getElementById('dark-mode-btn');
            if (btn) btn.setAttribute('aria-pressed', isDark.toString());
            StorageManager.saveDarkMode(isDark);
        }

        function togglePanel(panelName) {
            let el;
            let menuItem;

            if (panelName === 'sidebar') {
                el = document.getElementById('sidebar-panel');
                menuItem = document.getElementById('menu-toggle-sidebar');
            } else if (panelName === 'json') {
                el = document.getElementById('json-panel');
                menuItem = document.getElementById('menu-toggle-json');
            } else if (panelName === 'toolbar') {
                el = document.getElementById('formatting-toolbar');
                menuItem = document.getElementById('menu-toggle-toolbar');
            }

            if (!el) return;

            // Toggle logic
            const isVisible = el.style.display !== 'none';
            if (isVisible) {
                el.style.display = 'none';
                if (menuItem) menuItem.classList.remove('active');
            } else {
                el.style.display = 'flex';
                if (menuItem) menuItem.classList.add('active');
            }

            // Save panel states
            const states = StorageManager.loadPanelStates();
            states[panelName] = !isVisible;
            StorageManager.savePanelStates(states);

            // Trigger resize to update PDF scale/position if needed
            window.dispatchEvent(new Event('resize'));
        }

        // Image upload handling
        let currentImageFieldName = null;

        function triggerImageUpload(fieldName) {
            currentImageFieldName = fieldName;
            // Create a temporary file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = handleImageUpload;
            input.click();
        }

        function handleImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                // Convert all images to PNG to ensure compatibility with pdf-lib
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    // Force PNG format
                    const pngData = canvas.toDataURL('image/png');
                    fieldImages[currentImageFieldName] = pngData;

                    // Save to localStorage
                    StorageManager.saveImages(fieldImages);

                    console.log(`Image uploaded for ${currentImageFieldName} (converted to PNG)`);
                    updatePreview();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        // Update JSON from editable overlay
        function updateFieldFromOverlay(fieldName, element) {
            // Use innerText to preserve newlines, but fall back to textContent if needed
            const newValue = element.innerText;
            const trimmedValue = newValue.trim();
            try {
                const currentData = JSON.parse(jsonEditor.getValue());

                if (trimmedValue === '') {
                    // Remove the field if empty
                    delete currentData[fieldName];
                } else {
                    // Update the field
                    currentData[fieldName] = trimmedValue;
                }

                jsonEditor.setValue(JSON.stringify(currentData, null, 2));
                // Don't trigger full preview update - would lose focus and be jarring
            } catch (err) {
                console.error('Error updating JSON:', err);
            }
        }

        // Toggle checkbox value in JSON
        function toggleCheckbox(fieldName, newValue) {
            try {
                const currentData = JSON.parse(jsonEditor.getValue());

                if (newValue) {
                    currentData[fieldName] = true;
                } else {
                    // Remove the field if unchecked (or set to false)
                    delete currentData[fieldName];
                }

                jsonEditor.setValue(JSON.stringify(currentData, null, 2));
                updatePreview();
            } catch (err) {
                console.error('Error toggling checkbox:', err);
            }
        }

        document.getElementById('pdf-upload').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('file-name-display').textContent = file.name;
            document.getElementById('file-name-display').classList.remove('hidden');
            try {
                const arrayBuffer = await file.arrayBuffer();
                originalPdfBytes = new Uint8Array(arrayBuffer);
                await processPdfBytes();
            } catch (err) { console.error(err); alert("Error loading PDF."); }
        });

        function addKeyToJSON(key) {
            try {
                let obj = JSON.parse(jsonEditor.getValue());
                if (!obj.hasOwnProperty(key)) {
                    obj[key] = "";
                    jsonEditor.setValue(JSON.stringify(obj, null, 4));
                }
            } catch (e) {
                console.warn('Could not add key to invalid JSON');
            }
        }

        // Calculate optimal font size based on text and container
        function calculateFontSize(text, width, height, isMultiline) {
            if (!text) return 10;

            const textLength = text.length;

            if (isMultiline) {
                // For multiline: fit based on content density
                const lines = text.split('\n').length;
                const estimatedCharsPerLine = width / 5; // Rough char width
                const estimatedLines = Math.ceil(textLength / estimatedCharsPerLine);
                const totalLines = Math.max(lines, estimatedLines);

                // Calculate font size to fit all lines
                const maxFontSize = (height / totalLines) * 0.85;
                return Math.min(Math.max(maxFontSize, 6), 11);
            } else {
                // For single line: different strategy for short vs long text
                if (textLength <= 3) {
                    // Very short text (like ability scores): fill the box
                    return Math.min(height * 0.65, 20);
                } else if (textLength <= 6) {
                    // Short text (like modifiers): medium size
                    return Math.min(height * 0.55, 16);
                } else {
                    // Longer text: fit to width
                    const maxByHeight = height * 0.6;
                    const maxByWidth = (width / textLength) * 1.6;
                    return Math.min(Math.max(Math.min(maxByHeight, maxByWidth), 7), 14);
                }
            }
        }

        // Fast overlay update using cached page images
        function updateOverlays() {
            if (cachedPageImages.length === 0) return;
            
            const container = document.getElementById('pdf-container');
            container.innerHTML = '';
            
            // Get JSON data
            let dataMap = {};
            try { dataMap = JSON.parse(jsonEditor.getValue()); } catch (e) { dataMap = {}; }
            
            // Update scale if auto-fit
            if (isAutoFit && cachedPageDimensions.length > 0) {
                const containerW = container.clientWidth;
                if (containerW > 100) {
                    currentScale = (containerW - 64) / cachedPageDimensions[0].width;
                }
                document.getElementById('zoom-level').textContent = Math.round(currentScale * 100) + "%";
                document.getElementById('zoom-slider').value = Math.min(300, Math.max(10, Math.round(currentScale * 100)));
            }

            cachedPageImages.forEach((imageDataUrl, pageIndex) => {
                const dims = cachedPageDimensions[pageIndex];
                const displayWidth = dims.width * currentScale;
                const displayHeight = dims.height * currentScale;

                // Create wrapper for image + overlays
                const wrapper = document.createElement('div');
                wrapper.className = 'page-wrapper';
                wrapper.style.width = displayWidth + 'px';
                wrapper.style.height = displayHeight + 'px';
                wrapper.style.flexShrink = '0'; // Prevent flex from shrinking it

                // Display cached image at exact size
                const img = document.createElement('img');
                img.src = imageDataUrl;
                img.className = 'page-image';
                img.width = displayWidth;
                img.height = displayHeight;
                img.draggable = false;
                wrapper.appendChild(img);

                // Add field overlays for this page
                Object.entries(fieldMetadata).forEach(([fieldName, meta]) => {
                    if (meta.pageIndex !== pageIndex) return;

                    const scaledX = meta.x * currentScale;
                    const scaledY = (meta.pageHeight - meta.y - meta.height) * currentScale;
                    const scaledWidth = meta.width * currentScale;
                    const scaledHeight = meta.height * currentScale;

                    // Image fields
                    if (IMAGE_FIELDS.includes(fieldName)) {
                        const uploadBox = document.createElement('div');
                        uploadBox.className = 'image-upload-box' + (fieldImages[fieldName] ? ' has-image' : '');
                        uploadBox.style.cssText = `left:${scaledX}px;top:${scaledY}px;width:${scaledWidth}px;height:${scaledHeight}px`;
                        uploadBox.title = fieldName;
                        uploadBox.onclick = () => triggerImageUpload(fieldName);

                        const content = document.createElement('div');
                        content.className = 'upload-content';
                        const sizeHint = fieldName === 'CHARACTER IMAGE' ? '3:4 aspect ratio' : '4:5 aspect ratio';
                        content.innerHTML = `<div class="upload-icon">📷</div><div class="upload-text">Click to upload</div><div class="size-hint">${sizeHint}</div>`;
                        uploadBox.appendChild(content);

                        if (fieldImages[fieldName]) {
                            const uploadedImg = document.createElement('img');
                            uploadedImg.src = fieldImages[fieldName];
                            uploadBox.appendChild(uploadedImg);
                        }
                        wrapper.appendChild(uploadBox);
                        return;
                    }

                    // Checkbox fields
                    const isCheckboxField = meta.isCheckbox || fieldName.includes('Check Box');
                    if (isCheckboxField) {
                        const value = dataMap[fieldName];
                        const isChecked = value === true || value === "true";
                        const checkbox = document.createElement('div');
                        checkbox.className = 'field-overlay checkbox-overlay' + (isChecked ? ' checked' : '');
                        checkbox.style.cssText = `left:${scaledX}px;top:${scaledY}px;width:${scaledWidth}px;height:${scaledHeight}px;font-size:${scaledHeight * 0.8}px`;
                        checkbox.title = FIELD_DISPLAY_NAMES[fieldName] || fieldName;
                        checkbox.onclick = () => toggleCheckbox(fieldName, !isChecked);
                        wrapper.appendChild(checkbox);
                        return;
                    }

                    // Text fields
                    const value = dataMap[fieldName];
                    const textValue = value !== undefined ? String(value) : '';
                    if (textValue === 'true' || textValue === 'false') return;

                    const fontSize = calculateFontSize(textValue || 'placeholder', meta.width, meta.height, meta.isMultiline);
                    const scaledFontSize = fontSize * currentScale;

                    const overlay = document.createElement('div');
                    let className = 'field-overlay editable';
                    if (meta.isMultiline) className += ' multiline';
                    else if (textValue.length <= 3 && textValue.length > 0) className += ' centered';
                    
                    overlay.className = className;
                    overlay.contentEditable = 'true';
                    overlay.style.cssText = `left:${scaledX}px;top:${scaledY}px;width:${scaledWidth}px;height:${scaledHeight}px;font-size:${scaledFontSize}px;line-height:${meta.isMultiline ? '1.15' : '1'};white-space:${meta.isMultiline ? 'pre-wrap' : 'nowrap'}`;
                    overlay.setAttribute('data-field', fieldName);
                    overlay.setAttribute('data-placeholder', FIELD_DISPLAY_NAMES[fieldName] || fieldName);
                    overlay.title = FIELD_DISPLAY_NAMES[fieldName] || fieldName;
                    if (textValue) overlay.textContent = textValue;

                    // Event listeners
                    overlay.addEventListener('input', () => updateFieldFromOverlay(fieldName, overlay));
                    overlay.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !meta.isMultiline) {
                            e.preventDefault();
                            overlay.blur();
                        }
                    });

                    // Apply styles
                    const style = getStyle(fieldName);
                    let finalFontSize = style.fontSize ? parseFloat(style.fontSize) : fontSize;
                    overlay.style.fontSize = (finalFontSize * currentScale) + 'px';
                    if (style.align) overlay.style.textAlign = style.align;
                    if (style.color) overlay.style.color = style.color;
                    if (style.bold) overlay.style.fontWeight = 'bold';
                    if (style.italic) overlay.style.fontStyle = 'italic';
                    if (style.yOffset) overlay.style.top = (scaledY - (style.yOffset * currentScale)) + 'px';
                    if (style.xOffset) overlay.style.left = (scaledX + (style.xOffset * currentScale)) + 'px';
                    if (!meta.isMultiline && style.align === 'center') {
                        overlay.style.display = 'flex';
                        overlay.style.alignItems = 'center';
                        overlay.style.justifyContent = 'center';
                    }

                    overlay.addEventListener('focus', () => {
                        currentSelectedField = fieldName;
                        updateToolbarUI();
                    });
                    overlay.onclick = (e) => {
                        e.stopPropagation();
                        currentSelectedField = fieldName;
                        updateToolbarUI();
                    };

                    wrapper.appendChild(overlay);
                });

                // Debug boxes
                if (isDebugMode) {
                    Object.entries(fieldMetadata).forEach(([fieldName, meta]) => {
                        if (meta.pageIndex !== pageIndex) return;
                        const scaledX = meta.x * currentScale;
                        const scaledY = (meta.pageHeight - meta.y - meta.height) * currentScale;
                        const scaledWidth = meta.width * currentScale;
                        const scaledHeight = meta.height * currentScale;

                        const debugBox = document.createElement('div');
                        debugBox.className = 'debug-box' + (meta.isCheckbox ? ' checkbox' : '');
                        debugBox.style.cssText = `left:${scaledX}px;top:${scaledY}px;width:${scaledWidth}px;height:${scaledHeight}px`;
                        const label = document.createElement('span');
                        label.className = 'debug-label';
                        label.textContent = fieldName;
                        debugBox.appendChild(label);
                        wrapper.appendChild(debugBox);
                    });
                }

                // Uploaded images overlay
                Object.entries(fieldImages).forEach(([fieldName, imageData]) => {
                    if (!fieldMetadata[fieldName]) return;
                    const meta = fieldMetadata[fieldName];
                    if (meta.pageIndex !== pageIndex) return;

                    const scaledX = meta.x * currentScale;
                    const scaledY = (meta.pageHeight - meta.y - meta.height) * currentScale;
                    const scaledWidth = meta.width * currentScale;
                    const scaledHeight = meta.height * currentScale;

                    const img = document.createElement('img');
                    img.src = imageData;
                    img.style.cssText = `position:absolute;left:${scaledX}px;top:${scaledY}px;width:${scaledWidth}px;height:${scaledHeight}px;object-fit:cover;pointer-events:none`;
                    img.title = fieldName;
                    wrapper.appendChild(img);
                });

                container.appendChild(wrapper);
            });
        }

        // Keep updatePreview as alias for compatibility
        async function updatePreview() {
            if (cachedPageImages.length === 0 && originalPdfBytes) {
                await cachePdfPages();
            }
            updateOverlays();
        }




        function copyFieldCSV() {
            const lines = ["Field ID,Type,Description"];
            const sortedFields = Object.keys(fieldMetadata).sort();

            sortedFields.forEach(key => {
                const meta = fieldMetadata[key];
                const desc = FIELD_DISPLAY_NAMES[key] || key;
                
                // Determine field type
                let fieldType = "Text";
                if (meta && meta.isCheckbox) {
                    fieldType = "Checkbox";
                } else if (IMAGE_FIELDS.includes(key)) {
                    fieldType = "Image";
                }
                
                // Escape quotes and commas
                const safeKey = key.includes(',') ? `"${key}"` : key;
                const safeDesc = desc.includes(',') ? `"${desc}"` : desc;
                lines.push(`${safeKey},${fieldType},${safeDesc}`);
            });

            const csvContent = lines.join('\n');
            navigator.clipboard.writeText(csvContent).then(() => {
                alert('Field list copied to clipboard as CSV!');
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        }

        function exportJSON() {
            try {
                const data = jsonEditor.getValue();
                // Validate first
                JSON.parse(data);

                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'character_data.json';
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                alert('Invalid JSON, cannot export.');
            }
        }

        function importJSON() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = event => {
                    try {
                        const json = JSON.parse(event.target.result);
                        jsonEditor.setValue(JSON.stringify(json, null, 4));
                        updatePreview();
                    } catch (err) {
                        alert('Invalid JSON file.');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }
        // --- NEW FEATURES END ---

        // Download uses pdf-lib to actually fill the PDF
        async function downloadPDF() {
            const blob = await generatePDFBlob('download-btn');
            if (blob) {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `character_sheet_filled.pdf`;
                link.click();
            }
        }

        async function generatePDFBlob(callerId) {
            if (!originalPdfBytes) return;
            if (!validateJson()) return;

            const btn = document.getElementById(callerId || 'download-btn');
            const originalHTML = btn.innerHTML;
            const btnSpan = btn.querySelector('span');
            if (btnSpan) btnSpan.textContent = 'Generating...';
            else btn.textContent = 'Generating...';
            btn.disabled = true;

            try {
                const pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes.slice());
                const form = pdfDoc.getForm();
                const pages = pdfDoc.getPages();

                // 1. Embed and draw images
                for (const [fieldName, dataUrl] of Object.entries(fieldImages)) {
                    if (!dataUrl) continue;

                    try {
                        let image;
                        if (dataUrl.startsWith('data:image/png')) {
                            image = await pdfDoc.embedPng(dataUrl);
                        } else if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
                            image = await pdfDoc.embedJpg(dataUrl);
                        }

                        // Find field location
                        const meta = fieldMetadata[fieldName];
                        if (image && meta) {
                            const page = pages[meta.pageIndex];
                            page.drawImage(image, {
                                x: meta.x,
                                y: meta.y,
                                width: meta.width,
                                height: meta.height
                            });
                        }
                    } catch (err) { console.error(`Failed to embed image for ${fieldName}`, err); }
                }

                // 2. Fill form data using DIRECT DRAWING (Bypassing Form Fields)
                let dataMap = {};
                try { dataMap = JSON.parse(jsonEditor.getValue()); } catch (e) { return; }

                // Embed fonts
                const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
                const fontItalic = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaOblique);
                const fontBoldItalic = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBoldOblique);
                const fontZapf = await pdfDoc.embedFont(PDFLib.StandardFonts.ZapfDingbats);

                const getFont = (isBold, isItalic) => {
                    if (isBold && isItalic) return fontBoldItalic;
                    if (isBold) return fontBold;
                    if (isItalic) return fontItalic;
                    return fontRegular;
                };

                const hexToRgb = (hex) => {
                    if (!hex) return PDFLib.rgb(0, 0, 0);
                    const r = parseInt(hex.slice(1, 3), 16) / 255;
                    const g = parseInt(hex.slice(3, 5), 16) / 255;
                    const b = parseInt(hex.slice(5, 7), 16) / 255;
                    return PDFLib.rgb(r, g, b);
                };

                for (const [fieldName, value] of Object.entries(dataMap)) {
                    if (!fieldMetadata[fieldName]) continue;
                    const meta = fieldMetadata[fieldName];
                    const page = pages[meta.pageIndex];

                    if (!page) continue;
                    if (IMAGE_FIELDS.includes(fieldName)) continue;

                    const isCheckbox = meta.isCheckbox || fieldName.includes('Check Box');

                    if (isCheckbox) {
                        if (value === true || value === "true") {
                            const fontSize = meta.height * 0.8;
                            try {
                                // Try drawing checkmark with ZapfDingbats using correct Unicode
                                const checkMark = '\u2714'; // Heavy Check Mark
                                const textWidth = fontZapf.widthOfTextAtSize(checkMark, fontSize);
                                const x = meta.x + (meta.width - textWidth) / 2;
                                const y = meta.y + (meta.height - fontSize) / 2;

                                page.drawText(checkMark, {
                                    x: x,
                                    y: y,
                                    size: fontSize,
                                    font: fontZapf,
                                    color: PDFLib.rgb(0, 0, 0)
                                });
                            } catch (e) {
                                // Fallback to X if ZapfDingbats encoding fails
                                const textWidth = fontRegular.widthOfTextAtSize('X', fontSize);
                                const x = meta.x + (meta.width - textWidth) / 2;
                                const y = meta.y + (meta.height - fontSize) / 2 + 2;

                                page.drawText('X', {
                                    x: x,
                                    y: y,
                                    size: fontSize,
                                    font: fontRegular,
                                    color: PDFLib.rgb(0, 0, 0)
                                });
                            }
                        }
                    }
                    else {
                        let text = String(value);
                        if (!text) continue;

                        // Resolve style
                        const style = getStyle(fieldName);

                        // Determine Font
                        const currentFont = getFont(style.bold, style.italic);

                        // Determine Size
                        let fontSize = 10;
                        if (style.fontSize) {
                            fontSize = parseFloat(style.fontSize);
                        } else {
                            fontSize = calculateFontSize(text, meta.width, meta.height, meta.isMultiline);
                        }

                        // Determine Color
                        const color = style.color ? hexToRgb(style.color) : PDFLib.rgb(0, 0, 0);

                        // Determine Alignment
                        const align = style.align || 'left';

                        // Measure text
                        const measureText = (t) => currentFont.widthOfTextAtSize(t, fontSize);

                        let x = meta.x + 2;
                        let y = meta.y + 2;

                        if (align === 'center') {
                            const textWidth = measureText(text);
                            x = meta.x + (meta.width - textWidth) / 2;
                        } else if (align === 'right') {
                            const textWidth = measureText(text);
                            x = meta.x + meta.width - textWidth - 2;
                        }

                        // Vertical Alignment
                        if (!meta.isMultiline) {
                            y = meta.y + (meta.height - fontSize) / 2 + 2;
                        } else {
                            y = meta.y + meta.height - fontSize - 2;
                        }

                        // Offsets
                        if (style.yOffset) y += style.yOffset;
                        if (style.xOffset) x += style.xOffset;

                        // Draw
                        if (meta.isMultiline) {
                            page.drawText(text, {
                                x: x,
                                y: y,
                                size: fontSize,
                                font: currentFont,
                                color: color,
                                maxWidth: meta.width - 4,
                                lineHeight: fontSize * 1.15,
                                wordBreaks: [" "]
                            });
                        } else {
                            page.drawText(text, {
                                x: x,
                                y: y,
                                size: fontSize,
                                font: currentFont,
                                color: color
                            });
                        }
                    }
                }

                try {
                    form.flatten();
                } catch (e) { console.warn("Could not flatten form", e); }

                const filledBytes = await pdfDoc.save();
                const blob = new Blob([filledBytes], { type: "application/pdf" });

                return blob;
            } catch (error) {
                console.error('Error filling PDF:', error);
                alert('Error creating PDF. Check console for details.');
                return null;
            } finally {
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }
        }

        async function verifyPDF() {
            const blob = await generatePDFBlob('verify-btn');
            if (!blob) return;

            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        }

    // Register event listeners for buttons that had inline onclick removed
    document.addEventListener('DOMContentLoaded', function() {
        // Dark mode toggle
        var darkModeBtn = document.getElementById('dark-mode-btn');
        if (darkModeBtn) darkModeBtn.addEventListener('click', toggleDarkMode);
        
        // Debug toggle
        var debugBtn = document.getElementById('debug-toggle-btn');
        if (debugBtn) debugBtn.addEventListener('click', toggleDebug);
        
        // Download PDF
        var downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) downloadBtn.addEventListener('click', downloadPDF);
        
        // Verify PDF
        var verifyBtn = document.getElementById('verify-btn');
        if (verifyBtn) verifyBtn.addEventListener('click', verifyPDF);
        
        // Load sample PDF
        var loadSampleBtn = document.getElementById('load-sample-btn');
        if (loadSampleBtn) loadSampleBtn.addEventListener('click', loadSamplePDF);
        
        // Copy field CSV - find by data-action
        var copyBtn = document.querySelector('[data-action="copy-fields-csv"]');
        if (copyBtn) copyBtn.addEventListener('click', copyFieldCSV);
        
        // View dropdown trigger
        var viewDropdownTrigger = document.querySelector('#view-dropdown .dropdown-trigger');
        if (viewDropdownTrigger) {
            viewDropdownTrigger.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleDropdown('view-dropdown');
            });
        }
        
        // View dropdown menu items
        var sidebarMenuItem = document.getElementById('menu-toggle-sidebar');
        if (sidebarMenuItem) sidebarMenuItem.addEventListener('click', function(e) { e.stopPropagation(); togglePanelFromDropdown('sidebar'); });
        
        var toolbarMenuItem = document.getElementById('menu-toggle-toolbar');
        if (toolbarMenuItem) toolbarMenuItem.addEventListener('click', function(e) { e.stopPropagation(); togglePanelFromDropdown('toolbar'); });
        
        var jsonMenuItem = document.getElementById('menu-toggle-json');
        if (jsonMenuItem) jsonMenuItem.addEventListener('click', function(e) { e.stopPropagation(); togglePanelFromDropdown('json'); });
        
        var debugMenuItem = document.getElementById('menu-toggle-debug');
        if (debugMenuItem) debugMenuItem.addEventListener('click', function(e) { e.stopPropagation(); toggleDebugFromDropdown(); });
        
        // AutoFit button
        var autofitBtn = document.getElementById('btn-autofit');
        if (autofitBtn) autofitBtn.addEventListener('click', toggleAutoFit);
        
        // Zoom slider
        var zoomSlider = document.getElementById('zoom-slider');
        if (zoomSlider) {
            zoomSlider.addEventListener('input', function() { updateZoomLabel(this.value); });
            zoomSlider.addEventListener('change', function() { applyZoom(this.value); });
        }
        
        // Font size select
        var fontSizeSelect = document.getElementById('font-size-select');
        if (fontSizeSelect) fontSizeSelect.addEventListener('change', function() { applyStyle('fontSize', this.value); });
        
        // Text color picker
        var colorPicker = document.getElementById('text-color-picker');
        if (colorPicker) colorPicker.addEventListener('change', function() { applyStyle('color', this.value); });
        
        // Bold/Italic toggle buttons
        var boldBtn = document.getElementById('btn-bold');
        if (boldBtn) boldBtn.addEventListener('click', function() { toggleStyle('bold'); });
        
        var italicBtn = document.getElementById('btn-italic');
        if (italicBtn) italicBtn.addEventListener('click', function() { toggleStyle('italic'); });
        
        // Alignment buttons
        var alignLeftBtn = document.getElementById('btn-align-left');
        if (alignLeftBtn) alignLeftBtn.addEventListener('click', function() { applyStyle('align', 'left'); });
        
        var alignCenterBtn = document.getElementById('btn-align-center');
        if (alignCenterBtn) alignCenterBtn.addEventListener('click', function() { applyStyle('align', 'center'); });
        
        var alignRightBtn = document.getElementById('btn-align-right');
        if (alignRightBtn) alignRightBtn.addEventListener('click', function() { applyStyle('align', 'right'); });
        
        // Export/Import JSON buttons
        var exportBtn = document.querySelector('[data-action="export-json"]');
        if (exportBtn) exportBtn.addEventListener('click', exportJSON);
        
        var importBtn = document.querySelector('[data-action="import-json"]');
        if (importBtn) importBtn.addEventListener('click', importJSON);
        
        var resetBtn = document.querySelector('[data-action="reset-json"]');
        if (resetBtn) resetBtn.addEventListener('click', loadSampleData);
    });
})();