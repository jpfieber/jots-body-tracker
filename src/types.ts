export interface User {
    id: string;
    name: string;
}

export type MeasurementSystem = 'metric' | 'imperial';
export type MeasurementUnit = 'cm' | 'in' | 'kg' | 'lbs';

export interface Measurement {
    name: string;
    value: string;
    unit: MeasurementUnit;
    type: 'length' | 'weight';
}

export interface MeasurementRecord {
    date: string;
    userId: string;
    [key: string]: string; // This allows for dynamic measurement fields
}

export interface Settings {
    users: User[];
    measurements: Measurement[];
    measurementSystem: MeasurementSystem;
    defaultUser?: string;
    measurementHistory: MeasurementRecord[];
    // New settings
    enableJournalEntry: boolean;
    journalFolder: string;
    enableMeasurementFiles: boolean;
    measurementFolder: string;
}