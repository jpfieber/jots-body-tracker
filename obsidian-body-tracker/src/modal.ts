import { App, Modal, Setting } from 'obsidian';
import type { Settings, User, Measurement } from './types';

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
        contentEl.createEl('h2', { text: 'Body Measurements' });

        // Date picker
        new Setting(contentEl)
            .setName('Date')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD')
                .setValue(new Date().toISOString().split('T')[0])
                .setAttribute('type', 'date'));

        // User dropdown
        const userContainer = new Setting(contentEl)
            .setName('User')
            .addDropdown(dropdown => {
                this.settings.users.forEach(user => {
                    dropdown.addOption(user.id, user.name);
                });
                if (this.settings.defaultUser) {
                    dropdown.setValue(this.settings.defaultUser);
                }
            });

        // Measurements
        const measurementsContainer = contentEl.createDiv();
        measurementsContainer.addClass('measurements-container');

        this.settings.measurements.forEach(measurement => {
            new Setting(measurementsContainer)
                .setName(measurement.name)
                .addText(text => text
                    .setPlaceholder(`Enter ${measurement.name.toLowerCase()}`)
                    .setValue('')
                    .setAttribute('type', 'number')
                    .onChange(value => {
                        this.measurementValues[measurement.name] = value;
                    }));
        });

        // Add unit label to each measurement
        const unitLabels = measurementsContainer.querySelectorAll('.setting-item');
        unitLabels.forEach(label => {
            const unitSpan = label.createSpan();
            unitSpan.setText(` (${this.settings.measurementUnit})`);
            unitSpan.addClass('measurement-unit');
        });

        // Submit button
        const submitButton = new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Submit')
                .setCta()
                .onClick(() => {
                    const date = (contentEl.querySelector('input[type="date"]') as HTMLInputElement).value;
                    const userId = (contentEl.querySelector('.dropdown') as HTMLSelectElement).value;
                    this.handleSubmit(date, userId, this.measurementValues);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.measurementValues = {};
    }

    private handleSubmit(date: string, userId: string, measurements: { [key: string]: string }) {
        // Store the measurement data
        const measurementData = {
            date,
            userId,
            ...measurements
        };
        
        // Call the plugin's save method (to be implemented in main.ts)
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