import { App, TFile } from 'obsidian';
import type { Settings, MeasurementRecord } from '../types';

export class JournalService {
    private moment = (window as any).moment;

    constructor(private app: App, private settings: Settings) { }

    private getJournalPath(dateTime: moment.Moment): string {
        // Use the local date components to determine the journal path
        const formattedPath = dateTime.format(this.settings.journalSubDirectory);
        return `${this.settings.journalFolder}/${formattedPath}`;
    }

    private async createJournalPath(path: string): Promise<void> {
        const parts = path.split('/');
        let currentPath = '';

        for (const part of parts) {
            currentPath += (currentPath ? '/' : '') + part;
            await this.app.vault.createFolder(currentPath).catch(() => { });
        }
    }

    private hasExistingEntry(content: string, entry: string): boolean {
        // Convert both the content and entry to their non-decorated versions for comparison
        const normalizeEntry = (text: string) => {
            return text.replace(/^>?\s*/, '')  // Remove any callout markers
                .replace(/^\s*-\s*\[[^\]]+\]\s*/, '')  // Remove task markers
                .trim();
        };

        const normalizedEntry = normalizeEntry(entry);
        const lines = content.split('\n');

        return lines.some(line => normalizeEntry(line) === normalizedEntry);
    }

    async appendToJournal(data: MeasurementRecord): Promise<void> {
        // Parse the full date-time string to preserve local time
        const dateTime = this.moment(data.date, 'YYYY-MM-DD HH:mm');
        const journalPath = this.getJournalPath(dateTime);
        await this.createJournalPath(journalPath);

        console.log('Journal: Writing to journal path:', journalPath);

        // Get journal file name for the date, using local date components
        const fileName = dateTime.format(this.settings.journalNameFormat) + '.md';
        const filePath = `${journalPath}/${fileName}`;

        console.log('Journal: Target journal file:', filePath);

        // Create entries for each measurement
        for (const measurement of this.settings.measurements) {
            const value = data[measurement.name];
            if (value !== undefined) {
                // Get the appropriate unit based on measurement type and system
                const unit = measurement.type === 'weight'
                    ? (this.settings.measurementSystem === 'metric' ? 'kg' : 'lbs')
                    : (this.settings.measurementSystem === 'metric' ? 'cm' : 'in');

                // Format the entry using the template and add task prefix
                const entryContent = this.settings.journalEntryTemplate
                    .replace(/<measured>/g, measurement.name)
                    .replace(/<measure>/g, value)
                    .replace(/<unit>/g, unit);

                let entry = `- [${this.settings.stringPrefixLetter}] ${entryContent}`;

                if (this.settings.enableJournalEntryCallout) {
                    entry = `> ${entry}`;
                }

                console.log('Journal: Creating entry:', {
                    measurement: measurement.name,
                    value,
                    unit,
                    entry
                });

                // Append to journal file
                let fileContent = '';
                const existingFile = this.app.vault.getAbstractFileByPath(filePath);
                if (existingFile instanceof TFile) {
                    fileContent = await this.app.vault.read(existingFile);
                }

                // Only add the entry if it doesn't already exist
                if (!this.hasExistingEntry(fileContent, entry)) {
                    // Add the entry, ensuring no blank lines if in a callout
                    if (fileContent) {
                        if (this.settings.enableJournalEntryCallout) {
                            // Remove any trailing newlines to avoid breaking the callout
                            fileContent = fileContent.replace(/\n+$/, '') + '\n';
                        } else if (!fileContent.endsWith('\n')) {
                            fileContent += '\n';
                        }
                    }
                    fileContent += entry + '\n';

                    if (existingFile instanceof TFile) {
                        await this.app.vault.modify(existingFile, fileContent);
                    } else {
                        await this.app.vault.create(filePath, fileContent);
                    }
                }
            }
        }
    }
}