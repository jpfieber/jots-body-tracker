import { App, Modal, Setting } from 'obsidian';
import type { Settings, User, Measurement, MeasurementRecord } from './types';

export class MeasurementModal extends Modal {
    private settings: Settings;
    private measurementValues: { [key: string]: string } = {};

    constructor(app: App, private plugin: any) {
        super(app);
        this.settings = plugin.settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Title
        contentEl.createEl('h2', { text: 'Record Body Measurements' });

        // Date picker
        new Setting(contentEl)
            .setName('Date')
            .addText(text => {
                text.inputEl.type = 'datetime-local';
                const moment = (window as any).moment;
                const now = moment().format('YYYY-MM-DDTHH:mm');
                text.setValue(now);
                return text;
            });

        // User dropdown if multiple users exist
        if (this.settings.users.length > 0) {
            const userContainer = new Setting(contentEl)
                .setName('User')
                .addDropdown(dropdown => {
                    this.settings.users.forEach(user => {
                        dropdown.addOption(user.id, user.name);
                    });
                    if (this.settings.defaultUser) {
                        dropdown.setValue(this.settings.defaultUser);
                    } else if (this.settings.users.length > 0) {
                        dropdown.setValue(this.settings.users[0].id);
                    }
                });
        }

        // Create container for measurements
        const measurementsContainer = contentEl.createDiv();
        measurementsContainer.addClass('measurements-container');

        // Group measurements by type
        const measurementsByType: { [key: string]: Measurement[] } = {};
        this.settings.measurements.forEach(m => {
            if (!measurementsByType[m.type]) {
                measurementsByType[m.type] = [];
            }
            measurementsByType[m.type].push(m);
        });

        // Add measurements grouped by type
        Object.entries(measurementsByType).forEach(([type, measurements]) => {
            const typeHeading = measurementsContainer.createEl('h3', {
                text: type.charAt(0).toUpperCase() + type.slice(1) + ' Measurements'
            });
            typeHeading.style.marginTop = '1em';
            typeHeading.style.marginBottom = '0.5em';

            measurements.forEach(measurement => {
                const units = this.plugin.getUnitForMeasurement(measurement.type);
                const currentUnit = this.settings.measurementSystem === 'metric' ? units.metric : units.imperial;

                new Setting(measurementsContainer)
                    .setName(measurement.name)
                    .setDesc(`Enter value in ${currentUnit}`)
                    .addText(text => {
                        text.inputEl.type = 'number';
                        text.inputEl.step = '0.1';
                        text.setPlaceholder(`${measurement.name} (${currentUnit})`);
                        text.onChange(value => {
                            if (value) {
                                this.measurementValues[measurement.name] = value;
                            } else {
                                delete this.measurementValues[measurement.name];
                            }
                        });
                        return text;
                    });
            });
        });

        // Submit button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Save Measurements')
                .setCta()
                .onClick(() => {
                    const dateInput = contentEl.querySelector('input[type="datetime-local"]') as HTMLInputElement;
                    const userSelect = contentEl.querySelector('.dropdown') as HTMLSelectElement;
                    const userId = userSelect ? userSelect.value : (this.settings.defaultUser || this.settings.users[0]?.id || '');

                    if (Object.keys(this.measurementValues).length === 0) {
                        // No measurements entered
                        return;
                    }

                    this.handleSubmit(dateInput.value, userId, this.measurementValues);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.measurementValues = {};
    }

    private handleSubmit(dateStr: string, userId: string, measurements: { [key: string]: string }) {
        const measurementData: MeasurementRecord = {
            date: dateStr,
            userId
        };

        // Add each measurement with its value
        Object.entries(measurements).forEach(([name, value]) => {
            if (value && value.trim() !== '') {
                measurementData[name] = value;
            }
        });

        // Save measurements
        this.plugin.saveMeasurement(measurementData);
    }
}

// Add some CSS
document.head.createEl('style').setText(`
.measurements-container {
    max-height: 300px;
    overflow-y: auto;
    margin: 1em 0;
}
.measurement-unit {
    opacity: 0.7;
    margin-left: 0.5em;
}
`);