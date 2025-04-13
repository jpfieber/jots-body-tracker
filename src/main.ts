import { Plugin, TFile } from 'obsidian';
import { BodyTrackerSettingsTab } from './settings';
import { MeasurementModal } from './modal';
import type { Settings, Measurement, MeasurementRecord } from './types';

export default class BodyTrackerPlugin extends Plugin {
    settings!: Settings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new BodyTrackerSettingsTab(this.app, this));

        this.addCommand({
            id: 'open-measurement-modal',
            name: 'Add Body Measurement',
            callback: () => {
                new MeasurementModal(this.app, this).open();
            }
        });
    }

    async loadSettings() {
        const defaultMeasurements: Measurement[] = [
            { name: 'Weight', value: '', type: 'weight', unit: 'kg' },
            { name: 'Body Fat', value: '', type: 'length', unit: 'cm' },
            { name: 'Chest', value: '', type: 'length', unit: 'cm' },
            { name: 'Waist', value: '', type: 'length', unit: 'cm' },
        ];

        this.settings = Object.assign({
            users: [],
            measurements: defaultMeasurements,
            measurementSystem: 'metric',
            defaultUser: undefined,
            measurementHistory: [],
            // New default settings
            enableJournalEntry: false,
            journalFolder: 'Journal',
            enableMeasurementFiles: false,
            measurementFolder: 'Measurements'
        }, await this.loadData());
    }

    getUnitForMeasurement(type: 'length' | 'weight'): { metric: string, imperial: string } {
        return type === 'length'
            ? { metric: 'cm', imperial: 'in' }
            : { metric: 'kg', imperial: 'lbs' };
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async saveMeasurement(measurementData: MeasurementRecord) {
        if (!this.settings.measurementHistory) {
            this.settings.measurementHistory = [];
        }

        this.settings.measurementHistory.push(measurementData);
        await this.saveSettings();

        // Handle journal entry if enabled
        if (this.settings.enableJournalEntry) {
            await this.appendToJournal(measurementData);
        }

        // Handle measurement files if enabled
        if (this.settings.enableMeasurementFiles) {
            await this.updateMeasurementFiles(measurementData);
        }
    }

    private async appendToJournal(data: MeasurementRecord) {
        const journalPath = `${this.settings.journalFolder}/${data.date}.md`;
        let journalContent = '';

        // Try to read existing journal file
        const existingFile = this.app.vault.getAbstractFileByPath(journalPath);
        if (existingFile instanceof TFile) {
            journalContent = await this.app.vault.read(existingFile);
        }

        // Format measurements as a table
        const user = this.settings.users.find(u => u.id === data.userId);
        const measurementRows = this.settings.measurements.map(m => {
            const value = data[m.name] || '';
            return `| ${m.name} | ${value} ${m.unit} |`;
        }).join('\n');

        const measurementEntry = `
## Body Measurements${user ? ` - ${user.name}` : ''}
| Measurement | Value |
|------------|-------|
${measurementRows}
`;

        // Append to journal
        const newContent = journalContent ? `${journalContent}\n${measurementEntry}` : measurementEntry;

        // Create or update the journal file
        if (existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, newContent);
        } else {
            // Create folder if it doesn't exist
            await this.app.vault.createFolder(this.settings.journalFolder).catch(() => { });
            await this.app.vault.create(journalPath, newContent);
        }
    }

    private async updateMeasurementFiles(data: MeasurementRecord) {
        // Create the measurements folder if it doesn't exist
        await this.app.vault.createFolder(this.settings.measurementFolder).catch(() => { });

        // Update each measurement file
        for (const measurement of this.settings.measurements) {
            const value = data[measurement.name];
            if (value !== undefined) {
                const filePath = `${this.settings.measurementFolder}/${measurement.name}.md`;
                const user = this.settings.users.find(u => u.id === data.userId);

                // Create entry line
                const entry = `| ${data.date} | ${user?.name || 'Unknown'} | ${value} ${measurement.unit} |`;

                // Get or create file
                const existingFile = this.app.vault.getAbstractFileByPath(filePath);
                let content = '';

                if (existingFile instanceof TFile) {
                    content = await this.app.vault.read(existingFile);
                } else {
                    // Create new file with header
                    content = `# ${measurement.name} History\n\n| Date | User | Value |\n|------|------|-------|\n`;
                }

                // Add new entry
                const newContent = content.includes('| Date |')
                    ? `${content}${entry}\n`
                    : `# ${measurement.name} History\n\n| Date | User | Value |\n|------|------|-------|\n${entry}\n`;

                if (existingFile instanceof TFile) {
                    await this.app.vault.modify(existingFile, newContent);
                } else {
                    await this.app.vault.create(filePath, newContent);
                }
            }
        }
    }
}