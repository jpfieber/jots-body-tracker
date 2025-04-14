import { Plugin } from 'obsidian';
import { BodyTrackerSettingsTab } from './settings';
import { MeasurementModal } from './modal';
import type { Settings, Measurement, MeasurementRecord } from './types';
import { JournalService } from './services/journal-service';
import { MeasurementService } from './services/measurement-service';
import { StyleManager } from './services/style-manager';

export default class BodyTrackerPlugin extends Plugin {
    settings!: Settings;
    private journalService!: JournalService;
    private measurementService!: MeasurementService;
    private styleManager!: StyleManager;

    async onload() {
        await this.loadSettings();
        this.journalService = new JournalService(this.app, this.settings);
        this.measurementService = new MeasurementService(this.app, this.settings);
        this.styleManager = new StyleManager();
        
        // Initial style update
        this.styleManager.updateStyles(this.settings);

        this.addSettingTab(new BodyTrackerSettingsTab(this.app, this));

        this.addCommand({
            id: 'open-measurement-modal',
            name: 'Add Body Measurement',
            callback: () => {
                new MeasurementModal(this.app, this).open();
            }
        });
    }

    onunload() {
        this.styleManager.removeStyles();
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
            stringPrefixLetter: 'b',
            decoratedTaskSymbol: 'data:image/svg+xml,%3Csvg viewBox=\'0 0 16 16\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg id=\'SVGRepo_bgCarrier\' stroke-width=\'0\'%3E%3C/g%3E%3Cg id=\'SVGRepo_tracerCarrier\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3C/g%3E%3Cg id=\'SVGRepo_iconCarrier\'%3E%3Cpath d=\'M8.00006 3C8.82849 3 9.50006 2.32843 9.50006 1.5C9.50006 0.671573 8.82849 0 8.00006 0C7.17163 0 6.50006 0.671573 6.50006 1.5C6.50006 2.32843 7.17163 3 8.00006 3Z\' fill=\'%23000000\'%3E%3C/path%3E%3Cpath d=\'M15 4V6H10.5454L10.9898 16H8.98778L8.76561 11H7.23426L7.01198 16H5.01L5.45456 6H1V4H15Z\' fill=\'%23000000\'%3E%3C/path%3E%3C/g%3E%3C/svg%3E',
            journalEntryTemplate: '(measured:: <measured>): (measure:: <measure>)<unit>',
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
        // Update styles whenever settings change
        this.styleManager.updateStyles(this.settings);
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