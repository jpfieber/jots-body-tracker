import { Plugin } from 'obsidian';
import { BodyTrackerSettingsTab } from './settings';
import { MeasurementModal } from './modal';
import type { Settings, Measurement, MeasurementRecord } from './types';
import { JournalService } from './services/journal-service';
import { MeasurementService } from './services/measurement-service';

export default class BodyTrackerPlugin extends Plugin {
    settings!: Settings;
    private journalService!: JournalService;
    private measurementService!: MeasurementService;

    async onload() {
        await this.loadSettings();
        this.journalService = new JournalService(this.app, this.settings);
        this.measurementService = new MeasurementService(this.app, this.settings);

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
        return this.measurementService.getUnitForMeasurement(type);
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
            await this.journalService.appendToJournal(measurementData);
        }

        // Handle measurement files if enabled
        if (this.settings.enableMeasurementFiles) {
            await this.measurementService.updateMeasurementFiles(measurementData);
        }
    }
}