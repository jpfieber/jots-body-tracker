export type MeasurementType = 'length' | 'weight';
export type MeasurementSystem = 'metric' | 'imperial';
export type MeasurementUnit = 'cm' | 'in' | 'kg' | 'lbs';

export interface User {
    id: string;
    name: string;
}

export interface Measurement {
    name: string;
    value: string;
    type: MeasurementType;
    unit: MeasurementUnit;
}

export interface MeasurementRecord {
    [key: string]: string;
    date: string;
    userId: string;
}

export interface Settings {
    // Journal settings
    enableJournalEntry: boolean;
    enableJournalEntryCallout: boolean;
    journalFolder: string;
    journalSubDirectory: string;
    journalNameFormat: string;
    journalEntryTemplate: string;
    stringPrefixLetter: string;
    decoratedTaskSymbol: string;
    taskSvgIcon: string;
    dailyNoteTemplate?: string;

    // Measurement file settings
    enableMeasurementFiles: boolean;
    measurementFolder: string;
    measurementFileTemplate?: string;
    measurementEntryTemplate: string;
    measurementFileNameFormat: string;

    // Body Note settings
    enableBodyNotes: boolean;
    bodyNotesFolder: string;
    bodyNoteTemplate?: string;
    bodyNoteEntryTemplate: string;

    // User settings
    users: User[];
    defaultUser?: string;

    // Measurement settings
    measurementSystem: MeasurementSystem;
    measurements: Measurement[];

    // Google Fit integration settings
    enableGoogleFit: boolean;
    googleClientId: string;
    googleClientSecret: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleTokenExpiry?: number;
    googleAuthState?: string;
    googleAutoSyncInterval: number;
}

export const DEFAULT_SETTINGS: Settings = {
    enableJournalEntry: true,
    enableJournalEntryCallout: false,
    journalFolder: 'Journal',
    journalSubDirectory: 'YYYY/YYYY-MM',
    journalNameFormat: 'YYYY-MM-DD_DDD',
    journalEntryTemplate: '<measured>: <measure> <unit>',
    stringPrefixLetter: 'b',
    decoratedTaskSymbol: '⚡️',
    taskSvgIcon: '⚡️', // Ensure there's a default icon

    enableMeasurementFiles: true,
    measurementFolder: 'Measurements',
    measurementEntryTemplate: '| <date> | <user> | <measure> <unit> |',
    measurementFileNameFormat: '<measure>',

    users: [],
    measurementSystem: 'metric',
    measurements: [],

    // Google Fit defaults
    enableGoogleFit: false,
    googleClientId: '',
    googleClientSecret: '',
    googleAutoSyncInterval: 60
};