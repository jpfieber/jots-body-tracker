import { App, PluginSettingTab, Setting, setIcon, SearchComponent, Notice } from 'obsidian';
import { Settings, User, Measurement, MeasurementUnit } from './types';
import { FolderSuggest } from './foldersuggester';
import { FileSuggest } from './filesuggester';
import BodyTrackerPlugin from './main';

export class BodyTrackerSettingsTab extends PluginSettingTab {
    plugin: BodyTrackerPlugin;
    private lastConnectionState?: boolean;

    constructor(app: App, plugin: BodyTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.lastConnectionState = undefined;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Ensure we have the latest settings state before rendering
        const hasValidTokens = this.plugin.settings.googleRefreshToken &&
            (this.plugin.settings.googleAccessToken ||
                (this.plugin.settings.googleTokenExpiry && Date.now() < this.plugin.settings.googleTokenExpiry));

        const isConnected = hasValidTokens && this.plugin.googleFitService !== undefined;

        // Google Fit Integration Settings
        containerEl.createEl('h3', { text: 'Google Fit Integration' });

        new Setting(containerEl)
            .setName('Enable Google Fit Integration')
            .setDesc('Sync measurements from your Google Fit account')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableGoogleFit ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.enableGoogleFit = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        await this.plugin.setupGoogleFitService();
                    } else {
                        // Clear service when disabled
                        this.plugin.googleFitService = undefined;
                    }
                    requestAnimationFrame(() => this.display());
                }));

        if (this.plugin.settings.enableGoogleFit) {
            new Setting(containerEl)
                .setName('Client ID')
                .setDesc('Your Google Fit API Client ID')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('Enter Client ID')
                    .setValue(this.plugin.settings.googleClientId || '')
                    .onChange(async (value) => {
                        this.plugin.settings.googleClientId = value;
                        await this.plugin.saveSettings();
                        await this.plugin.setupGoogleFitService();
                        requestAnimationFrame(() => this.display());
                    }));

            new Setting(containerEl)
                .setName('Client Secret')
                .setDesc('Your Google Fit API Client Secret')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('Enter Client Secret')
                    .setValue(this.plugin.settings.googleClientSecret || '')
                    .onChange(async (value) => {
                        this.plugin.settings.googleClientSecret = value;
                        await this.plugin.saveSettings();
                        await this.plugin.setupGoogleFitService();
                        requestAnimationFrame(() => this.display());
                    }));

            const statusDesc = isConnected ? 'Connected' :
                (!this.plugin.settings.googleClientId || !this.plugin.settings.googleClientSecret) ?
                    'Missing API credentials' : 'Not Connected';

            const authSetting = new Setting(containerEl)
                .setName('Connection Status')
                .setDesc(`Status: ${statusDesc}`)
                .setClass('settings-indent');

            if (this.plugin.settings.googleClientId && this.plugin.settings.googleClientSecret) {
                authSetting.addButton(button => button
                    .setButtonText(isConnected ? 'Disconnect' : 'Connect')
                    .setCta()
                    .onClick(async () => {
                        if (isConnected) {
                            // Clear tokens
                            this.plugin.settings.googleAccessToken = '';
                            this.plugin.settings.googleRefreshToken = '';
                            this.plugin.settings.googleTokenExpiry = undefined;
                            await this.plugin.saveSettings();
                            // Reset service
                            this.plugin.googleFitService = undefined;
                            requestAnimationFrame(() => this.display());
                        } else {
                            try {
                                // Ensure service is initialized
                                await this.plugin.setupGoogleFitService();
                                if (!this.plugin.googleFitService) {
                                    throw new Error('Failed to initialize Google Fit service');
                                }

                                // Start OAuth flow
                                const success = await this.plugin.googleFitService.authenticate();
                                if (!success) {
                                    new Notice('Failed to connect to Google Fit. Please try again.');
                                }
                                requestAnimationFrame(() => this.display());
                            } catch (error) {
                                console.error('Failed to authenticate:', error);
                                new Notice('Failed to connect to Google Fit: ' + (error instanceof Error ? error.message : 'Unknown error'));
                            }
                        }
                    }));
            }

            // Only show auto-sync setting if connected
            if (isConnected) {
                new Setting(containerEl)
                    .setName('Auto-Sync Interval')
                    .setDesc('How often to automatically sync with Google Fit (in minutes, 0 to disable)')
                    .setClass('settings-indent')
                    .addText(text => text
                        .setPlaceholder('60')
                        .setValue(String(this.plugin.settings.googleAutoSyncInterval || 0))
                        .onChange(async (value) => {
                            const interval = parseInt(value) || 0;
                            this.plugin.settings.googleAutoSyncInterval = interval;
                            await this.plugin.saveSettings();
                            this.plugin.setupGoogleFitSync();
                        }));
            }
        }

        // Journal Entry Settings
        containerEl.createEl('h3', { text: 'Journal Entries' });

        new Setting(containerEl)
            .setName('Enable Journal Entries')
            .setDesc('Add measurements to your daily journal')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableJournalEntry)
                .onChange(async (value) => {
                    this.plugin.settings.enableJournalEntry = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.enableJournalEntry) {
            new Setting(containerEl)
                .setName('Journal Folder')
                .setDesc('Folder where your daily journal entries are stored')
                .setClass('settings-indent')
                .addSearch((cb) => {
                    new FolderSuggest(this.app, cb.inputEl);
                    cb.setPlaceholder("Journal")
                        .setValue(this.plugin.settings.journalFolder)
                        .onChange(async (value) => {
                            this.plugin.settings.journalFolder = value;
                            await this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Journal Subdirectory Format')
                .setDesc('Format for organizing journal files in subfolders (e.g. YYYY/YYYY-MM)')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('YYYY/YYYY-MM')
                    .setValue(this.plugin.settings.journalSubDirectory)
                    .onChange(async (value) => {
                        this.plugin.settings.journalSubDirectory = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Journal Name Format')
                .setDesc('Format for journal filenames (e.g. YYYY-MM-DD_DDD for 2025-04-13_Sun)')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('YYYY-MM-DD_DDD')
                    .setValue(this.plugin.settings.journalNameFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.journalNameFormat = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Daily Note Template')
                .setDesc('Template file to use when creating new daily notes (.md files only)')
                .setClass('settings-indent')
                .addSearch((cb) => {
                    new FileSuggest(this.app, cb.inputEl);
                    cb.setPlaceholder("templates/daily.md")
                        .setValue(this.plugin.settings.dailyNoteTemplate || '')
                        .onChange((new_path) => {
                            this.plugin.settings.dailyNoteTemplate = new_path;
                            this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Journal Entry Template')
                .setDesc('Template for each measurement entry. Use <measured>, <measure>, and <unit> as placeholders')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('<measured>: <measure> <unit>')
                    .setValue(this.plugin.settings.journalEntryTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.journalEntryTemplate = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Task Prefix')
                .setDesc('The letter to use as prefix in measurement entries (e.g. "b" for "- [b]")')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('b')
                    .setValue(this.plugin.settings.stringPrefixLetter)
                    .onChange(async (value) => {
                        this.plugin.settings.stringPrefixLetter = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Task SVG Icon')
                .setDesc('Enter either a single emoji (e.g. ⚡️) or raw SVG markup for the icon to use for measurement entries.')
                .setClass('settings-indent')
                .addTextArea(text => text
                    .setPlaceholder('⚡️ or <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="..."/></svg>')
                    .setValue(this.plugin.settings.taskSvgIcon || '')
                    .onChange(async (value) => {
                        this.plugin.settings.taskSvgIcon = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('In Callout')
                .setDesc('Place entries in a callout block')
                .setClass('settings-indent')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enableJournalEntryCallout ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.enableJournalEntryCallout = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // Body Notes Settings
        containerEl.createEl('h3', { text: 'Body Notes' });

        new Setting(containerEl)
            .setName('Enable Body Notes')
            .setDesc('Add measurements to individual tracking notes for each measurement type')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableBodyNotes ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.enableBodyNotes = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.enableBodyNotes) {
            new Setting(containerEl)
                .setName('Body Notes Folder')
                .setDesc('Folder where your body measurement tracking notes will be stored')
                .setClass('settings-indent')
                .addSearch((cb) => {
                    new FolderSuggest(this.app, cb.inputEl);
                    cb.setPlaceholder("Body")
                        .setValue(this.plugin.settings.bodyNotesFolder || '')
                        .onChange(async (value) => {
                            this.plugin.settings.bodyNotesFolder = value;
                            await this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Note Template')
                .setDesc('Template file to use when creating new body measurement notes (.md files only)')
                .setClass('settings-indent')
                .addSearch((cb) => {
                    new FileSuggest(this.app, cb.inputEl);
                    cb.setPlaceholder("templates/body-note.md")
                        .setValue(this.plugin.settings.bodyNoteTemplate || '')
                        .onChange((new_path) => {
                            this.plugin.settings.bodyNoteTemplate = new_path;
                            this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('Entry Format')
                .setDesc('Template for entries in body measurement notes. Use <date>, <user>, <measure>, and <unit> as placeholders')
                .setClass('settings-indent')
                .addText(text => text
                    .setPlaceholder('| <date> | <user> | <measure> <unit> |')
                    .setValue(this.plugin.settings.bodyNoteEntryTemplate || '')
                    .onChange(async (value) => {
                        this.plugin.settings.bodyNoteEntryTemplate = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // Measurement System Selection
        containerEl.createEl('h3', { text: 'Measurement System' });

        new Setting(containerEl)
            .setName('Default Measurement System')
            .setDesc('Choose your preferred measurement system')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('metric', 'Metric')
                    .addOption('imperial', 'Imperial')
                    .setValue(this.plugin.settings.measurementSystem)
                    .onChange(async (value) => {
                        this.plugin.settings.measurementSystem = value as 'metric' | 'imperial';
                        // Update all measurement units based on the new system
                        this.plugin.settings.measurements.forEach(m => {
                            const units = this.plugin.getUnitForMeasurement(m.type);
                            m.unit = value === 'metric' ? units.metric as MeasurementUnit : units.imperial as MeasurementUnit;
                        });
                        await this.plugin.saveSettings();
                        this.display();
                    }));

        // User Management
        containerEl.createEl('h3', { text: 'Users' });

        // Add existing users
        this.plugin.settings.users.forEach((user, index) => {
            const isDefault = this.plugin.settings.defaultUser === user.id;
            const setting = new Setting(containerEl)
                .setName(user.name);

            if (isDefault) {
                setting.setDesc('Default User');
                setting.nameEl.createSpan({
                    cls: 'default-user-star',
                    text: '★'
                });
            }

            setting
                .addButton(btn => btn
                    .setButtonText('Remove')
                    .onClick(async () => {
                        this.plugin.settings.users.splice(index, 1);
                        if (this.plugin.settings.defaultUser === user.id) {
                            this.plugin.settings.defaultUser = undefined;
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    }))
                .addButton(btn => btn
                    .setButtonText(isDefault ? 'Unset Default' : 'Set Default')
                    .onClick(async () => {
                        this.plugin.settings.defaultUser = isDefault ? undefined : user.id;
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        });

        // Add new user button
        new Setting(containerEl)
            .setName('Add New User')
            .addText(text => text
                .setPlaceholder('Enter user name')
                .onChange(() => { }))
            .addButton(btn => btn
                .setButtonText('Add')
                .onClick(async (evt) => {
                    if (!evt.target) return;
                    const element = evt.target as HTMLElement;
                    const textComponent = element.parentElement?.querySelector('input');
                    const userName = textComponent?.value;
                    if (userName) {
                        this.plugin.settings.users.push({
                            id: Date.now().toString(),
                            name: userName
                        });
                        await this.plugin.saveSettings();
                        if (textComponent) textComponent.value = '';
                        this.display();
                    }
                }));

        // Measurements Management
        containerEl.createEl('h3', { text: 'Measurements' });
        const measurementsContainer = containerEl.createDiv('measurements-list');

        // Add table header
        const headerRow = measurementsContainer.createDiv('measurements-table-header');
        headerRow.createDiv().setText('Measure');
        headerRow.createDiv().setText('Type');
        headerRow.createDiv().setText('Controls');

        // Add existing measurements
        this.plugin.settings.measurements.forEach((measurement, index) => {
            const measurementRow = measurementsContainer.createDiv('measurements-table-row');

            // Name cell
            const nameCell = measurementRow.createDiv('measurements-name-cell');
            nameCell.setText(measurement.name);

            // Type dropdown cell
            const typeCell = measurementRow.createDiv('measurements-unit-cell');
            const typeDropdown = new Setting(typeCell);
            typeDropdown.addDropdown(dropdown => {
                const system = this.plugin.settings.measurementSystem;
                const lengthUnit = system === 'metric' ? 'Length (cm)' : 'Length (in)';
                const weightUnit = system === 'metric' ? 'Weight (kg)' : 'Weight (lbs)';

                dropdown
                    .addOption('length', lengthUnit)
                    .addOption('weight', weightUnit)
                    .setValue(measurement.type)
                    .onChange(async (value) => {
                        const newType = value as 'length' | 'weight';
                        measurement.type = newType;
                        const units = this.plugin.getUnitForMeasurement(newType);
                        measurement.unit = this.plugin.settings.measurementSystem === 'metric'
                            ? units.metric as MeasurementUnit
                            : units.imperial as MeasurementUnit;
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

            // Controls cell
            const controlsCell = measurementRow.createDiv('measurements-controls-cell');
            const controlsSettings = new Setting(controlsCell);

            if (index > 0) {
                controlsSettings.addButton(btn => btn
                    .setIcon('up-chevron-glyph')
                    .setTooltip('Move up')
                    .onClick(async () => {
                        const temp = this.plugin.settings.measurements[index];
                        this.plugin.settings.measurements[index] = this.plugin.settings.measurements[index - 1];
                        this.plugin.settings.measurements[index - 1] = temp;
                        await this.plugin.saveSettings();
                        this.display();
                    }));
            }

            if (index < this.plugin.settings.measurements.length - 1) {
                controlsSettings.addButton(btn => btn
                    .setIcon('down-chevron-glyph')
                    .setTooltip('Move down')
                    .onClick(async () => {
                        const temp = this.plugin.settings.measurements[index];
                        this.plugin.settings.measurements[index] = this.plugin.settings.measurements[index + 1];
                        this.plugin.settings.measurements[index + 1] = temp;
                        await this.plugin.saveSettings();
                        this.display();
                    }));
            }

            controlsSettings.addButton(btn => btn
                .setIcon('trash')
                .setTooltip('Remove')
                .onClick(async () => {
                    this.plugin.settings.measurements.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.display();
                }));
        });

        // Add new measurement row
        const newMeasurementRow = measurementsContainer.createDiv('measurements-table-row');

        // Name input
        const newNameCell = newMeasurementRow.createDiv('measurements-name-cell');
        const nameInput = newNameCell.createEl('input', {
            attr: {
                type: 'text',
                placeholder: 'Enter measurement name'
            }
        });

        // Type dropdown
        const newTypeCell = newMeasurementRow.createDiv('measurements-unit-cell');
        const typeSelect = newTypeCell.createEl('select');
        const system = this.plugin.settings.measurementSystem;
        typeSelect.createEl('option', {
            text: `Length (${system === 'metric' ? 'cm' : 'in'})`,
            value: 'length'
        });
        typeSelect.createEl('option', {
            text: `Weight (${system === 'metric' ? 'kg' : 'lbs'})`,
            value: 'weight'
        });

        // Add button
        const newControlsCell = newMeasurementRow.createDiv('measurements-controls-cell');
        const addButton = newControlsCell.createEl('button', {
            text: 'Add'
        });
        addButton.addEventListener('click', async () => {
            const measurementName = nameInput.value;
            const measurementType = typeSelect.value as 'length' | 'weight';

            if (measurementName) {
                const units = this.plugin.getUnitForMeasurement(measurementType);
                const unit = this.plugin.settings.measurementSystem === 'metric'
                    ? units.metric
                    : units.imperial;

                this.plugin.settings.measurements.push({
                    name: measurementName,
                    value: '',
                    type: measurementType,
                    unit: unit as MeasurementUnit
                });

                await this.plugin.saveSettings();
                nameInput.value = '';
                this.display();
            }
        });

        // Add website and coffee sections at the end
        this.addWebsiteSection(containerEl);
        this.addCoffeeSection(containerEl);
    }

    private addWebsiteSection(containerEl: HTMLElement) {
        const websiteDiv = containerEl.createEl('div', { cls: 'jots-sleep-tracker-website-section' });

        const logoLink = websiteDiv.createEl('a', { href: 'https://jots.life' });
        logoLink.setAttribute('target', '_blank');

        logoLink.createEl('img', {
            attr: {
                src: 'https://jots.life/jots-logo-512/',
                alt: 'JOTS Logo',
            },
        });

        const descriptionDiv = websiteDiv.createEl('div', { cls: 'jots-sleep-tracker-website-description' });

        descriptionDiv.appendText('While this plugin works on its own, it is part of a system called ');
        const jotsLink = descriptionDiv.createEl('a', {
            text: 'JOTS',
            href: 'https://jots.life'
        });
        jotsLink.setAttribute('target', '_blank');
        descriptionDiv.appendText(' that helps capture, organize, and visualize your life\'s details.');
    }

    private addCoffeeSection(containerEl: HTMLElement) {
        const coffeeDiv = containerEl.createEl('div', { cls: 'jots-sleep-tracker-buy-me-coffee' });

        const coffeeLink = coffeeDiv.createEl('a', {
            href: 'https://www.buymeacoffee.com/jpfieber'
        });
        coffeeLink.setAttribute('target', '_blank');

        coffeeLink.createEl('img', {
            attr: {
                src: 'https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png',
                alt: 'Buy Me A Coffee'
            },
            cls: 'jots-sleep-tracker-bmc-button'
        });
    }
}