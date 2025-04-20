export const DEFAULT_SETTINGS = {
    enableJournalEntry: true,
    enableJournalEntryCallout: false,
    journalFolder: 'Journal',
    journalSubDirectory: 'YYYY/YYYY-MM',
    journalNameFormat: 'YYYY-MM-DD_DDD',
    journalEntryTemplate: '<measured>: <measure> <unit>',
    stringPrefixLetter: 'b',
    decoratedTaskSymbol: '⚡️',

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

export const MEASUREMENT_UNITS = ['cm', 'inches'];

export const MEASUREMENT_TYPES = [
    'Chest',
    'Waist',
    'Hips',
    'Thigh',
    'Arm',
    'Neck',
];