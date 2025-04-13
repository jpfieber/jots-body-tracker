export interface User {
    id: string;
    name: string;
}

export interface Measurement {
    name: string;
    value: string;
}

export interface MeasurementRecord {
    date: string;
    userId: string;
    [key: string]: string; // This allows for dynamic measurement fields
}

export interface Settings {
    users: User[];
    measurements: Measurement[];
    measurementUnit: 'cm' | 'in';
    defaultUser?: string;
    measurementHistory: MeasurementRecord[];
}