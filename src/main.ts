import { Plugin, TFile } from 'obsidian';
import { BodyTrackerSettingsTab } from './settings';
import { MeasurementModal } from './modal';
import type { Settings, Measurement, MeasurementRecord } from './types';
import { createNewNote } from './note-creator';
import type { NoteCreatorSettings } from './note-creator';

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
            // Journal settings
            enableJournalEntry: false,
            journalFolder: 'Chrono/Journals',
            journalSubDirectory: 'YYYY/YYYY-MM',
            journalNameFormat: 'YYYY-MM-DD_ddd',
            journalEntryTemplate: '- [b] (measured:: <measured>): (measure:: <measure>)<unit>',
            // Measurement file settings
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
        console.log('[Main] Received measurement data:', measurementData);

        if (!this.settings.measurementHistory) {
            this.settings.measurementHistory = [];
        }

        this.settings.measurementHistory.push(measurementData);
        await this.saveSettings();

        // Handle journal entry if enabled
        if (this.settings.enableJournalEntry) {
            console.log('[Main] Creating journal entry for date:', measurementData.date);
            await this.appendToJournal(measurementData);
        }

        // Handle measurement files if enabled
        if (this.settings.enableMeasurementFiles) {
            await this.updateMeasurementFiles(measurementData);
        }
    }

    private getTodayJournalPath(date: string): string {
        const moment = (window as any).moment;
        if (!moment) {
            throw new Error('Moment.js is required');
        }
        console.log('[Main] getTodayJournalPath input date:', date);
        console.log('[Main] Current settings:', {
            journalFolder: this.settings.journalFolder,
            journalSubDirectory: this.settings.journalSubDirectory,
            journalNameFormat: this.settings.journalNameFormat
        });

        // Create and validate the moment object
        const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
        const mDate = moment([year, month - 1, day]).hours(12);

        if (!mDate.isValid()) {
            console.error('[Main] Invalid date format:', date);
            throw new Error('Invalid date format');
        }

        // Format path components using settings
        const subDir = mDate.format(this.settings.journalSubDirectory);
        let fileName = mDate.format(this.settings.journalNameFormat);

        // Special handling for ddd to ensure continuous iteration through dates
        fileName = fileName.replace('ddd', String.fromCharCode(97 + mDate.day())); // a-g for Sun-Sat

        const fullPath = `${this.settings.journalFolder}/${subDir}/${fileName}.md`;

        console.log('[Main] Generated journal path components:', {
            subDir,
            fileName,
            fullPath,
            settings: {
                subDirFormat: this.settings.journalSubDirectory,
                nameFormat: this.settings.journalNameFormat
            }
        });

        return fullPath;
    }

    private async appendToJournal(data: MeasurementRecord) {
        // Debug the incoming data
        console.log('[Main] appendToJournal received:', {
            date: data.date,
            measurements: Object.keys(data).filter(k => k !== 'date' && k !== 'userId')
        });

        const journalPath = this.getTodayJournalPath(data.date);
        console.log('[Main] Looking for existing file at:', journalPath);

        let file = this.app.vault.getAbstractFileByPath(journalPath);
        console.log('[Main] File exists check:', {
            path: journalPath,
            fileFound: !!file,
            fileType: file ? file.constructor.name : 'none'
        });

        let journalContent = '';

        // If file doesn't exist, create it using note creator
        if (!(file instanceof TFile)) {
            console.log('[Main] File not found or not a TFile, would create new file');
            const settings: NoteCreatorSettings = {
                rootFolder: this.settings.journalFolder,
                subFolder: this.settings.journalSubDirectory,
                nameFormat: this.settings.journalNameFormat,
                templatePath: this.settings.dailyNoteTemplate
            };

            try {
                // Create a simple title for the new file using moment
                const moment = (window as any).moment;
                const titleDate = moment(data.date);
                const title = '# ' + titleDate.format('dddd, MMMM D, YYYY');

                file = await createNewNote(
                    this.app,
                    data.date,
                    journalPath,
                    settings,
                    title
                );
            } catch (error) {
                console.error('Failed to create note:', error);
                // Create a basic file if note creation fails
                await this.app.vault.createFolder(this.settings.journalFolder);
                file = await this.app.vault.create(journalPath, '');
            }
        } else {
            console.log('[Main] Found existing file:', {
                path: file.path,
                basename: file.basename
            });
        }

        // Read existing content
        if (file instanceof TFile) {
            journalContent = await this.app.vault.read(file);
        }

        // Format measurements using template
        const measurementLines = Object.entries(data)
            .filter(([key]) => key !== 'date' && key !== 'userId') // Filter out non-measurement fields
            .map(([name, value]) => {
                const measurement = this.settings.measurements.find(m => m.name === name);
                if (!measurement) return null;

                // Create the measurement line using the template with unit support
                return this.settings.journalEntryTemplate
                    .replace(/<measured>/g, measurement.name)
                    .replace(/<measure>/g, value)
                    .replace(/<unit>/g, measurement.unit);
            })
            .filter(line => line !== null)
            .join('\n');

        // Simply append the new measurements to the end of the file with a blank line
        journalContent = journalContent.trim() + '\n\n' + measurementLines + '\n';

        // Update the file
        if (file instanceof TFile) {
            await this.app.vault.modify(file, journalContent);
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