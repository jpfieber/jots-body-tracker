export const DEFAULT_SETTINGS = {
    // Journal settings
    enableJournalEntry: true,
    enableJournalEntryCallout: false,
    journalFolder: 'Journal',
    journalSubDirectory: 'YYYY/YYYY-MM',
    journalNameFormat: 'YYYY-MM-DD_DDD',
    journalEntryTemplate: '<measured>: <measure> <unit>',
    stringPrefixLetter: 'b',
    decoratedTaskSymbol: '⚡️',

    // Measurement file settings
    enableMeasurementFiles: true,
    measurementFolder: 'Measurements',
    measurementFileTemplate: '',
    measurementEntryTemplate: '| <date> | <user> | <measure> <unit> |',
    measurementFileNameFormat: '<measure>',

    // Body Notes settings
    enableBodyNotes: false,
    bodyNotesFolder: 'Body',
    bodyNoteTemplate: '',
    bodyNoteEntryTemplate: '| <date> | <user> | <measure> <unit> |',
    taskSvgIcon: '⚡️',

    // User settings
    users: [],
    defaultUser: undefined,
    measurementSystem: 'metric',
    measurements: [
        {
            name: 'Weight',
            type: 'weight',
            unit: 'kg'
        },
        {
            name: 'Body Fat',
            type: 'weight',
            unit: 'kg'
        },
        {
            name: 'Height',
            type: 'length',
            unit: 'cm'
        },
        {
            name: 'Chest',
            type: 'length',
            unit: 'cm'
        },
        {
            name: 'Waist',
            type: 'length',
            unit: 'cm'
        },
        {
            name: 'Hips',
            type: 'length',
            unit: 'cm'
        }
    ],

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