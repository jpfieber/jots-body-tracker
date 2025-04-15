import { Plugin, addIcon, Modal, Notice } from 'obsidian';
import { MeasurementModal } from './modal';
import { BodyTrackerSettingsTab } from './settings';
import { MeasurementService } from './services/measurement-service';
import { JournalService } from './services/journal-service';
import { GoogleFitService } from './services/googlefit';
import { StyleManager } from './services/style-manager';
import { MeasurementType, Settings, DEFAULT_SETTINGS } from './types';

export default class BodyTrackerPlugin extends Plugin {
    settings: Settings;
    measurementService: MeasurementService;
    googleFitService?: GoogleFitService;
    googleFitSyncInterval?: number;
    styleManager: StyleManager;

    async onload() {
        await this.loadSettings();
        this.measurementService = new MeasurementService(this.app, this.settings);
        
        // Initialize style manager and apply styles
        this.styleManager = new StyleManager();
        this.styleManager.updateStyles(this.settings);
        
        // Initialize Google Fit service if enabled
        this.setupGoogleFitService();

        // Add the settings tab
        this.addSettingTab(new BodyTrackerSettingsTab(this.app, this));

        // Add the ribbon icon
        this.addRibbonIcon('ruler', 'Add Body Measurement', () => {
            new MeasurementModal(this.app, this).open();
        });

        // Add command for manual measurement entry
        this.addCommand({
            id: 'add-measurement',
            name: 'Add Body Measurement',
            callback: () => {
                new MeasurementModal(this.app, this).open();
            }
        });

        // Add Google Fit commands
        this.addCommands();
    }

    onunload() {
        // Clean up style manager
        this.styleManager.removeStyles();
        
        // Clear any sync intervals
        if (this.googleFitSyncInterval) {
            window.clearInterval(this.googleFitSyncInterval);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update styles whenever settings are saved
        this.styleManager.updateStyles(this.settings);
    }

    getUnitForMeasurement(type: MeasurementType): { metric: string, imperial: string } {
        return type === 'length'
            ? { metric: 'cm', imperial: 'in' }
            : { metric: 'kg', imperial: 'lbs' };
    }

    setupGoogleFitService() {
        if (this.settings.enableGoogleFit) {
            if (!this.settings.googleClientId || !this.settings.googleClientSecret) {
                console.error('Google Fit service not initialized: Missing client credentials');
                new Notice('Please enter your Google Fit API credentials in the settings');
                return;
            }

            console.log('Initializing Google Fit service with:', {
                hasClientId: !!this.settings.googleClientId,
                hasClientSecret: !!this.settings.googleClientSecret
            });

            this.googleFitService = new GoogleFitService(this.settings, {
                clientId: this.settings.googleClientId,
                clientSecret: this.settings.googleClientSecret,
                redirectUri: 'http://localhost:16321/callback',
                scope: [
                    'https://www.googleapis.com/auth/fitness.body.read',
                    'https://www.googleapis.com/auth/fitness.body.write'
                ],
                onSettingsChange: async (settings) => {
                    this.settings = settings;
                    await this.saveSettings();
                }
            });
            this.setupGoogleFitSync();
        } else {
            this.googleFitService = undefined;
            if (this.googleFitSyncInterval) {
                window.clearInterval(this.googleFitSyncInterval);
                this.googleFitSyncInterval = undefined;
            }
        }
    }

    setupGoogleFitSync() {
        // Clear existing interval if any
        if (this.googleFitSyncInterval) {
            window.clearInterval(this.googleFitSyncInterval);
            this.googleFitSyncInterval = undefined;
        }

        // Set up new sync interval if enabled
        if (this.settings.enableGoogleFit && this.settings.googleAutoSyncInterval > 0) {
            this.googleFitSyncInterval = window.setInterval(
                () => this.syncGoogleFit(),
                this.settings.googleAutoSyncInterval * 60 * 1000 // Convert minutes to milliseconds
            );
        }
    }

    async syncGoogleFit() {
        if (!this.googleFitService || !this.settings.googleAccessToken) {
            return;
        }

        try {
            // Get measurements from the last 24 hours
            const now = Math.floor(Date.now() / 1000);
            const oneDayAgo = now - (24 * 60 * 60);

            const measurements = await this.googleFitService.getMeasurements(oneDayAgo, now);

            // Process each measurement
            for (const measurement of measurements) {
                const date = new Date(measurement.date * 1000).toISOString().split('T')[0];

                // Create measurement record
                const record: Record<string, string> = {
                    date: date,
                    userId: this.settings.defaultUser || this.settings.users[0]?.id || ''
                };

                // Add each measurement type if available
                if (measurement.weight) {
                    record['Weight'] = measurement.weight.toString();
                }
                if (measurement.bodyFat) {
                    record['Body Fat'] = measurement.bodyFat.toString();
                }

                // Save the measurements
                await this.measurementService.updateMeasurementFiles(record);
            }

            new Notice('Successfully synced with Google Fit');
        } catch (error) {
            console.error('Failed to sync with Google Fit:', error);
            new Notice('Failed to sync with Google Fit. Check the console for details.');
        }
    }

    async saveMeasurement(data: MeasurementRecord) {
        // Add to measurement files
        if (this.settings.enableMeasurementFiles) {
            await this.measurementService.updateMeasurementFiles(data);
        }

        // Add to journal entry
        if (this.settings.enableJournalEntry) {
            const journalService = new JournalService(this.app, this.settings);
            await journalService.appendToJournal(data);
        }
    }

    private addCommands() {
        // Add Google Fit-related commands
        this.addCommand({
            id: 'connect-google-fit',
            name: 'Connect Google Fit Account',
            checkCallback: (checking: boolean) => {
                const canRun = this.settings.enableGoogleFit
                    && this.settings.googleClientId
                    && this.settings.googleClientSecret
                    && !this.settings.googleAccessToken;

                if (checking) return canRun;

                if (canRun) {
                    this.googleFitService?.authenticate();
                }

                return canRun;
            }
        });

        this.addCommand({
            id: 'sync-google-fit',
            name: 'Sync Google Fit Measurements',
            checkCallback: (checking: boolean) => {
                const canRun = this.settings.enableGoogleFit
                    && this.settings.googleAccessToken
                    && !!this.googleFitService;

                if (checking) return canRun;

                if (canRun) {
                    this.syncGoogleFit();
                }

                return canRun;
            }
        });

        this.addCommand({
            id: 'complete-google-fit-auth',
            name: 'Complete Google Fit Authentication',
            callback: () => {
                const modal = new Modal(this.app);
                modal.titleEl.setText('Complete Google Fit Authentication');

                const contentEl = modal.contentEl;
                contentEl.empty();

                const codeInput = contentEl.createEl('input', {
                    attr: {
                        type: 'text',
                        placeholder: 'Enter the code from the redirect URL'
                    }
                });

                const stateInput = contentEl.createEl('input', {
                    attr: {
                        type: 'text',
                        placeholder: 'Enter the state from the redirect URL'
                    }
                });

                const buttonDiv = contentEl.createDiv();
                buttonDiv.style.marginTop = '1em';

                const submitButton = buttonDiv.createEl('button', {
                    text: 'Complete Authentication'
                });
                submitButton.onclick = async () => {
                    const code = codeInput.value;
                    const state = stateInput.value;

                    if (!code || !state) {
                        new Notice('Please enter both code and state values');
                        return;
                    }

                    try {
                        await this.googleFitService?.completeAuthentication(code, state);
                        modal.close();
                        new Notice('Successfully connected to Google Fit!');
                    } catch (error) {
                        console.error('Failed to complete authentication:', error);
                        new Notice('Failed to complete authentication. Check the console for details.');
                    }
                };

                modal.open();
            }
        });
    }
}