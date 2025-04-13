import { App, PluginSettingTab, Setting, setIcon } from 'obsidian';
import { Settings, User, Measurement, MeasurementUnit } from './types';
import { FolderSuggest } from './foldersuggester';
import BodyTrackerPlugin from './main';

export class BodyTrackerSettingsTab extends PluginSettingTab {
    plugin: BodyTrackerPlugin;

    constructor(app: App, plugin: BodyTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Body Tracker Settings' });

        // Output Settings
        containerEl.createEl('h3', { text: 'Output Settings' });

        // Journal Entry Settings
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
            const journalFolderSetting = new Setting(containerEl)
                .setName('Journal Folder')
                .setDesc('Folder where your daily journal entries are stored')
                .setClass('settings-indent')
                .addText(text => {
                    text.setPlaceholder('Journal')
                        .setValue(this.plugin.settings.journalFolder)
                        .onChange(async (value) => {
                            this.plugin.settings.journalFolder = value;
                            await this.plugin.saveSettings();
                        });

                    // Initialize folder suggester
                    new FolderSuggest(this.app, text.inputEl);
                });
        }

        // Measurement Files Settings
        new Setting(containerEl)
            .setName('Enable Measurement Files')
            .setDesc('Create individual files for each measurement type')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMeasurementFiles)
                .onChange(async (value) => {
                    this.plugin.settings.enableMeasurementFiles = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (this.plugin.settings.enableMeasurementFiles) {
            const measurementFolderSetting = new Setting(containerEl)
                .setName('Measurement Files Folder')
                .setDesc('Folder where measurement files will be stored')
                .setClass('settings-indent')
                .addText(text => {
                    text.setPlaceholder('Measurements')
                        .setValue(this.plugin.settings.measurementFolder)
                        .onChange(async (value) => {
                            this.plugin.settings.measurementFolder = value;
                            await this.plugin.saveSettings();
                        });

                    // Initialize folder suggester
                    new FolderSuggest(this.app, text.inputEl);
                });
        }

        // Add a spacer
        containerEl.createEl('div', { cls: 'settings-separator' }).style.margin = '2em 0';

        // Measurement System Selection
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
        headerRow.createDiv().setText('Units');
        headerRow.createDiv().setText('Controls');

        // Add existing measurements
        this.plugin.settings.measurements.forEach((measurement, index) => {
            const measurementRow = measurementsContainer.createDiv('measurements-table-row');

            // Name cell
            const nameCell = measurementRow.createDiv('measurements-name-cell');
            nameCell.setText(measurement.name);

            // Unit dropdown cell
            const unitCell = measurementRow.createDiv('measurements-unit-cell');
            const unitDropdown = new Setting(unitCell);
            unitDropdown.addDropdown(dropdown => {
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

        // Add new measurement button
        const newMeasurementRow = measurementsContainer.createDiv('measurements-table-row');

        // Name cell
        const newNameCell = newMeasurementRow.createDiv('measurements-name-cell');
        const nameInput = newNameCell.createEl('input', {
            attr: {
                type: 'text',
                placeholder: 'Enter measurement name'
            }
        });

        // Unit dropdown cell
        const newUnitCell = newMeasurementRow.createDiv('measurements-unit-cell');
        const unitSelect = newUnitCell.createEl('select');
        const system = this.plugin.settings.measurementSystem;
        const lengthOption = unitSelect.createEl('option', {
            text: `Length (${system === 'metric' ? 'cm' : 'in'})`,
            value: 'length'
        });
        const weightOption = unitSelect.createEl('option', {
            text: `Weight (${system === 'metric' ? 'kg' : 'lbs'})`,
            value: 'weight'
        });

        // Add button cell
        const newControlsCell = newMeasurementRow.createDiv('measurements-controls-cell');
        const addButton = newControlsCell.createEl('button', {
            text: 'Add'
        });
        addButton.addEventListener('click', async () => {
            const measurementName = nameInput.value;
            const measurementType = unitSelect.value as 'length' | 'weight';

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
    }
}