import { App, TFile } from 'obsidian';
import type { Settings, MeasurementRecord } from '../types';

export class MeasurementService {
    constructor(private app: App, private settings: Settings) { }

    async updateMeasurementFiles(data: MeasurementRecord) {
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

    getUnitForMeasurement(type: 'length' | 'weight'): { metric: string, imperial: string } {
        return type === 'length'
            ? { metric: 'cm', imperial: 'in' }
            : { metric: 'kg', imperial: 'lbs' };
    }
}