import { App, TFile } from 'obsidian';
import type { Settings, MeasurementRecord } from '../types';
import { createNewNote } from '../note-creator';
import type { NoteCreatorSettings } from '../note-creator';
import { getJournalPath } from './path-service';

export class JournalService {
    constructor(private app: App, private settings: Settings) { }

    async appendToJournal(data: MeasurementRecord) {
        const journalPath = getJournalPath(data.date, this.settings);
        let file = this.app.vault.getAbstractFileByPath(journalPath);
        let journalContent = '';

        // If file doesn't exist, create it using note creator
        if (!(file instanceof TFile)) {
            const settings: NoteCreatorSettings = {
                rootFolder: this.settings.journalFolder,
                subFolder: this.settings.journalSubDirectory,
                nameFormat: this.settings.journalNameFormat,
                templatePath: this.settings.dailyNoteTemplate
            };

            try {
                const moment = (window as any).moment;
                const titleDate = moment(data.date);
                const title = '# ' + titleDate.format('dddd, MMMM D, YYYY');
                file = await createNewNote(this.app, data.date, journalPath, settings, title);
            } catch (error) {
                console.error('Failed to create note:', error);
                await this.app.vault.createFolder(this.settings.journalFolder);
                file = await this.app.vault.create(journalPath, '');
            }
        }

        // Read existing content
        if (file instanceof TFile) {
            journalContent = await this.app.vault.read(file);
        }

        // Format measurements using template
        const measurementLines = Object.entries(data)
            .filter(([key]) => key !== 'date' && key !== 'userId')
            .map(([name]) => {
                const measurement = this.settings.measurements.find(m => m.name === name);
                if (!measurement) return null;

                const formattedEntry = this.settings.journalEntryTemplate
                    .replace(/<measured>/g, name)
                    .replace(/<measure>/g, data[name])
                    .replace(/<unit>/g, measurement.unit);

                // Use proper task list syntax: "- [ ]" with the stringPrefixLetter inside the brackets
                return `- [${this.settings.stringPrefixLetter}] ${formattedEntry}`;
            })
            .filter(line => line !== null)
            .join('\n');

        // Append the new measurements to the end of the file with a single newline
        journalContent = journalContent.trim() + '\n' + measurementLines + '\n';

        // Update the file
        if (file instanceof TFile) {
            await this.app.vault.modify(file, journalContent);
        }
    }
}