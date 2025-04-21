import { App, TFile, Notice } from 'obsidian';
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

    private async ensureFolderExists(path: string): Promise<void> {
        const parts = path.split('/');
        let currentPath = '';

        for (const part of parts) {
            currentPath += (currentPath ? '/' : '') + part;
            await this.app.vault.createFolder(currentPath).catch(() => { });
        }
    }

    public async appendToBodyNote(data: MeasurementRecord, measurement: string): Promise<void> {
        try {
            if (!this.settings.bodyNotesFolder) {
                throw new Error('Body notes folder not configured');
            }

            // Create the notes folder if it doesn't exist
            await this.ensureFolderExists(this.settings.bodyNotesFolder);

            // Construct the note path - each measurement gets its own note
            const notePath = `${this.settings.bodyNotesFolder}/${measurement}.md`;
            let file = this.app.vault.getAbstractFileByPath(notePath);

            // Create the file if it doesn't exist
            if (!(file instanceof TFile)) {
                const initialContent = this.settings.bodyNoteTemplate
                    ? await this.app.vault.read(this.app.vault.getAbstractFileByPath(this.settings.bodyNoteTemplate) as TFile)
                    : `# ${measurement} Tracking\n\n| Date | Time | User | Measurement |\n|------|------|------|-------------|\n`;

                file = await this.app.vault.create(notePath, initialContent);
            }

            // Ensure file is ready
            if (!(file instanceof TFile)) {
                throw new Error('Failed to create or access body note file');
            }

            // Read existing content
            let content = await this.app.vault.read(file);

            // Format the date and time
            const dateTime = this.moment(data.date);
            const date = dateTime.format('YYYY-MM-DD');
            const time = dateTime.format('HH:mm');
            const user = this.settings.users.find(u => u.id === data.userId)?.name || 'Unknown';

            // Format the entry using the template
            const entry = this.settings.bodyNoteEntryTemplate
                .replace(/<date>/g, date)
                .replace(/<time>/g, time)
                .replace(/<user>/g, user)
                .replace(/<measure>/g, data[measurement])
                .replace(/<unit>/g, data[`${measurement}_unit`] || '');

            // Only add if we don't already have this entry
            if (!this.hasExistingEntry(content, entry)) {
                content = content.trim() + '\n' + entry;
                await this.app.vault.modify(file, content);
                new Notice(`Updated ${measurement} note`);
            }

        } catch (error) {
            console.error('Failed to update body note:', error);
            new Notice(`Failed to update ${measurement} note. Please try again.`);
            throw error;
        }
    }
}