import { Plugin } from 'obsidian';
import { BodyTrackerSettingsTab } from './settings';
import { MeasurementModal } from './modal';
import type { Settings } from './types';

export default class BodyTrackerPlugin extends Plugin {
    settings: Settings;

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
        this.settings = Object.assign({
            users: [],
            measurements: [
                { name: 'Weight', value: '' },
                { name: 'Body Fat', value: '' },
                { name: 'Chest', value: '' },
                { name: 'Waist', value: '' },
            ],
            measurementUnit: 'cm',
            defaultUser: undefined
        }, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async saveMeasurement(measurementData: any) {
        // Create a measurements array if it doesn't exist
        if (!this.settings.measurementHistory) {
            this.settings.measurementHistory = [];
        }
        
        // Add the new measurement
        this.settings.measurementHistory.push(measurementData);
        
        // Save to plugin data
        await this.saveSettings();
    }
}