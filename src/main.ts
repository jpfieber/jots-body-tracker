import { Plugin, addIcon, Modal, Notice } from 'obsidian';
import { MeasurementModal } from './modal';
import { BodyTrackerSettingsTab } from './settings';
import { MeasurementService } from './services/measurement-service';
import { JournalService } from './services/journal-service';
import { GoogleFitService } from './services/googlefit';
import { StyleManager } from './services/style-manager';
import { MeasurementType, Settings, DEFAULT_SETTINGS, MeasurementRecord } from './types';

export default class BodyTrackerPlugin extends Plugin {
    settings!: Settings;
    measurementService!: MeasurementService;
    journalService!: JournalService;
    styleManager!: StyleManager;
    googleFitService?: GoogleFitService;
    googleFitSyncInterval?: number;

    async onload() {
        console.log('Body Tracker: Loading Plugin');
        await this.loadSettings();

        // Initialize services
        this.measurementService = new MeasurementService(this.app, this.settings);
        this.journalService = new JournalService(this.app, this.settings);
        this.styleManager = new StyleManager();
        // Set initial icon from settings
        this.styleManager.setCustomIcon(this.settings.taskSvgIcon || '');
        this.styleManager.updateStyles(this.settings);
        await this.setupGoogleFitService();

        // Add settings tab
        this.addSettingTab(new BodyTrackerSettingsTab(this.app, this));

        // Add command to record measurements
        this.addCommand({
            id: 'record-measurements',
            name: 'Record Body Measurements',
            callback: () => {
                const modal = new MeasurementModal(this.app, this);
                modal.open();
            }
        });

        // Add command to sync with Google Fit
        this.addCommands();

        // Setup automatic Google Fit sync if enabled
        this.setupGoogleFitSync();
    }

    onunload() {
        console.log('Body Tracker: Unloading Plugin');
        // Clean up style manager
        this.styleManager.removeStyles();

        // Clear any sync intervals
        if (this.googleFitSyncInterval) {
            window.clearInterval(this.googleFitSyncInterval);
            this.googleFitSyncInterval = undefined;
        }

        // Close OAuth server if it exists
        if (this.googleFitService?.oauthServer) {
            try {
                this.googleFitService.oauthServer.close();
            } catch (error) {
                console.error('Error closing OAuth server:', error);
            }
        }

        // Clear the service reference but keep tokens for next load
        this.googleFitService = undefined;
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

        // Preserve token state if we have a refresh token
        if (this.settings.googleRefreshToken) {
            // Keep the access token if it's not expired
            if (this.settings.googleTokenExpiry && Date.now() < this.settings.googleTokenExpiry) {
                // Token still valid, keep it
            } else {
                // Token expired, clear it but keep refresh token
                this.settings.googleAccessToken = '';
                this.settings.googleTokenExpiry = undefined;
            }
        } else {
            // No refresh token, clear all auth state
            this.settings.googleAccessToken = '';
            this.settings.googleTokenExpiry = undefined;
            this.settings.googleAuthState = undefined;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);

        // Update styles whenever settings are saved
        this.styleManager.setCustomIcon(this.settings.taskSvgIcon || '');
        this.styleManager.updateStyles(this.settings);

        // Force refresh ALL settings tabs to ensure connection status is updated
        const settingsLeaf = this.app.workspace.getLeavesOfType('settings')[0];
        if (settingsLeaf) {
            const settingsTab = settingsLeaf.view;
            const activeTabId = (settingsTab as any)?.currentTab?.id;

            // If we're on our tab, force an immediate refresh
            if (activeTabId === 'body-tracker') {
                const tab = (settingsTab as any)?.tabContentContainer?.children?.['body-tracker'];
                if (tab) {
                    tab.display();
                }
            }
        }
    }

    getUnitForMeasurement(type: MeasurementType): { metric: string, imperial: string } {
        return type === 'length'
            ? { metric: 'cm', imperial: 'in' }
            : { metric: 'kg', imperial: 'lbs' };
    }

    setupGoogleFitService() {
        if (this.settings.enableGoogleFit) {
            if (!this.settings.googleClientId || !this.settings.googleClientSecret) {
                new Notice('Please enter your Google Fit API credentials in the settings');
                return;
            }

            this.googleFitService = new GoogleFitService(this.settings, {
                clientId: this.settings.googleClientId,
                clientSecret: this.settings.googleClientSecret,
                redirectUri: 'http://localhost:16321/callback',
                scope: [
                    'https://www.googleapis.com/auth/fitness.body.read',
                    'https://www.googleapis.com/auth/fitness.body.write'
                ],
                onSettingsChange: async (settings) => {
                    // Update our settings
                    this.settings = settings;

                    // Save settings to disk
                    await this.saveData(this.settings);

                    // Update any open settings tabs immediately
                    const settingsLeaf = this.app.workspace.getLeavesOfType('settings')[0];
                    if (settingsLeaf) {
                        const settingsTab = settingsLeaf.view;
                        const tab = (settingsTab as any)?.tabContentContainer?.children?.['body-tracker'];
                        if (tab) {
                            requestAnimationFrame(() => {
                                tab.display();
                            });
                        }
                    }
                },
                app: this.app
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
            // Get measurements from the last 7 days relative to current time
            const now = Math.floor(new Date().getTime() / 1000);
            const sevenDaysAgo = now - (7 * 24 * 60 * 60);

            const measurements = await this.googleFitService.getMeasurements(sevenDaysAgo, now);

            // Process each measurement
            for (const measurement of measurements) {
                const moment = (window as any).moment;
                const measurementDate = moment(measurement.date * 1000);
                const record: MeasurementRecord = {
                    date: measurementDate.format('YYYY-MM-DD HH:mm'),
                    userId: this.settings.defaultUser || this.settings.users[0]?.id || ''
                };

                // Add weight measurement if available
                if (measurement.weight) {
                    // Convert kg to lbs if using imperial system
                    const weight = this.settings.measurementSystem === 'imperial'
                        ? measurement.weight * 2.20462  // Convert kg to lbs
                        : measurement.weight;

                    record['Weight'] = weight.toFixed(1);
                }

                if (measurement.bodyFat) {
                    record['Body Fat'] = measurement.bodyFat.toFixed(1);
                }

                // Save the measurements
                if (this.settings.enableMeasurementFiles) {
                    await this.measurementService.updateMeasurementFiles(record);
                }
                if (this.settings.enableJournalEntry) {
                    const journalService = new JournalService(this.app, this.settings);
                    await journalService.appendToJournal(record);
                }
            }

            new Notice('Successfully synced measurements from Google Fit');
        } catch (error) {
            new Notice('Failed to sync with Google Fit. Check the console for details.');
            throw error;
        }
    }

    async saveMeasurement(data: MeasurementRecord): Promise<void> {
        try {
            // Add to daily journal if enabled
            if (this.settings.enableJournalEntry) {
                await this.journalService.appendToJournal(data);
            }

            // Add to individual body notes if enabled
            if (this.settings.enableBodyNotes) {
                for (const measurement of this.settings.measurements) {
                    if (data[measurement.name] !== undefined) {
                        await this.journalService.appendToBodyNote(data, measurement.name);
                    }
                }
            }

            // Update any UI elements that show the current measurement state
            this.refreshSettingsTab();

        } catch (error) {
            console.error('Failed to save measurement:', error);
            new Notice('Failed to save measurement. Please try again.');
        }
    }

    private addCommands() {
        this.addCommand({
            id: 'sync-google-fit',
            name: 'Sync Google Fit Measurements',
            checkCallback: (checking: boolean): boolean => {
                const canRun: boolean = !!(
                    this.settings.enableGoogleFit
                    && this.settings.googleAccessToken
                    && this.googleFitService
                );

                if (checking) return canRun;

                if (canRun) {
                    this.syncGoogleFit();
                }

                return canRun;
            }
        });

        this.addCommand({
            id: 'connect-google-fit',
            name: 'Connect Google Fit Account',
            checkCallback: (checking: boolean): boolean => {
                const canRun: boolean = !!(
                    this.settings.enableGoogleFit
                    && this.settings.googleClientId
                    && this.settings.googleClientSecret
                    && !this.settings.googleAccessToken
                );

                if (checking) return canRun;

                if (canRun) {
                    this.googleFitService?.authenticate();
                }

                return canRun;
            }
        });
    }

    private refreshSettingsTab() {
        // Force refresh settings tab if it's open
        const settingsLeaf = this.app.workspace.getLeavesOfType('settings')[0];
        if (settingsLeaf) {
            const settingsTab = settingsLeaf.view;
            const tab = (settingsTab as any)?.tabContentContainer?.children?.['body-tracker'];
            if (tab) {
                setTimeout(() => tab.display(), 50); // Small delay to ensure settings are saved
            }
        }
    }
}