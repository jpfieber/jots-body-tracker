import { request, Notice, App } from 'obsidian';
import type { Settings } from '../types';
import { OAuthCallbackServer } from './oauth-server';

interface GoogleFitAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string[];
}

interface GoogleFitMeasurement {
    date: number;
    weight?: number;
    bodyFat?: number;
}

interface GoogleFitServiceConfig extends GoogleFitAuthConfig {
    onSettingsChange: (settings: Settings) => Promise<void>;
    app: App;
}

const SCOPES = [
    'https://www.googleapis.com/auth/fitness.body.read',
    'https://www.googleapis.com/auth/fitness.body.write'
];

export class GoogleFitService {
    private settings: Settings;
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;
    private scope: string[];
    private onSettingsChange: (settings: Settings) => Promise<void>;
    private app: App;
    private lastRequestTime = 0;
    private readonly minRequestInterval = 1000; // 1 second between requests
    readonly oauthServer: OAuthCallbackServer;
    private moment = (window as any).moment;

    constructor(settings: Settings, config: GoogleFitServiceConfig) {
        this.settings = settings;
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.redirectUri = config.redirectUri;
        this.scope = config.scope;
        this.onSettingsChange = config.onSettingsChange;
        this.app = config.app;
        this.oauthServer = new OAuthCallbackServer(config.app);
    }

    private async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise(resolve =>
                setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
            );
        }
        this.lastRequestTime = Date.now();
    }

    async authenticate(): Promise<boolean> {
        const state = Math.random().toString(36).substring(7);

        // Save auth state and wait for it to persist
        this.settings.googleAuthState = state;
        await this.onSettingsChange(this.settings);

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: 'http://localhost:16321/callback',  // Explicitly include /callback path
            response_type: 'code',
            scope: SCOPES.join(' '),
            access_type: 'offline',
            state: state,
            prompt: 'consent'  // Always show consent screen to ensure we get refresh token
        });

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

        // Ensure server is running before opening URL
        await this.oauthServer.close().catch(() => { }); // Close any existing server
        await this.oauthServer.start();

        try {
            // Open auth URL in default browser
            window.open(authUrl);

            const { code, state: returnedState } = await this.oauthServer.waitForCallback();

            if (!code || !returnedState) {
                throw new Error('Authentication failed - no code or state received');
            }

            // Complete authentication with received code
            await this.completeAuthentication(code, returnedState);

            // Wait a moment for settings to be saved and UI to update
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify the tokens were saved
            if (!this.settings.googleAccessToken || !this.settings.googleRefreshToken) {
                throw new Error('Authentication failed - tokens not saved');
            }

            return true;
        } catch (error) {
            new Notice('Authentication failed. Please try again.');
            return false;
        } finally {
            // Only close the server after everything is done
            try {
                await this.oauthServer.close();
            } catch (e) {
                console.error('Error closing OAuth server:', e);
            }
        }
    }

    async completeAuthentication(code: string, state: string): Promise<void> {
        if (state !== this.settings.googleAuthState) {
            throw new Error('Invalid authentication state');
        }

        try {
            const response = await request({
                url: 'https://oauth2.googleapis.com/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code: code,
                    grant_type: 'authorization_code',
                    redirect_uri: this.redirectUri
                }).toString()
            });

            const tokens = JSON.parse(response);
            if (!tokens.access_token || !tokens.refresh_token) {
                throw new Error('Invalid token response - missing required tokens');
            }

            // Update tokens and save settings
            this.settings.googleAccessToken = tokens.access_token;
            this.settings.googleRefreshToken = tokens.refresh_token;
            this.settings.googleTokenExpiry = Date.now() + (tokens.expires_in * 1000);

            // Save settings and wait for callback to complete
            await this.onSettingsChange(this.settings);

            // Give the UI a moment to update
            await new Promise(resolve => setTimeout(resolve, 100));

            // Force a final UI refresh via app
            const settingsTab = (this.app as any).setting?.activeTab;
            if (settingsTab?.id === 'body-tracker') {
                requestAnimationFrame(() => settingsTab.display());
            }

            new Notice('Successfully connected to Google Fit');
        } catch (error) {
            // Clear any partial token state on failure
            this.settings.googleAccessToken = '';
            this.settings.googleRefreshToken = '';
            this.settings.googleTokenExpiry = undefined;
            await this.onSettingsChange(this.settings);
            throw error;
        }
    }

    private async ensureValidToken(): Promise<void> {
        // If we have an expiry time and the token is expired or about to expire (within 5 minutes)
        if (this.settings.googleTokenExpiry && Date.now() + 300000 > this.settings.googleTokenExpiry) {
            await this.refreshAccessToken();
        }
    }

    private async refreshAccessToken(): Promise<void> {
        if (!this.settings.googleRefreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    refresh_token: this.settings.googleRefreshToken,
                    grant_type: 'refresh_token',
                }),
            });

            let errorData = {};
            try {
                errorData = await response.json();
            } catch (e) {
                // Ignore JSON parse errors for non-JSON responses
            }

            if (!response.ok) {
                // Only clear tokens for specific OAuth errors that indicate the refresh token is invalid
                if (response.status === 400 || response.status === 401) {
                    const errorMessage = (errorData as any).error;
                    if (errorMessage === 'invalid_grant' || errorMessage === 'invalid_token') {
                        this.settings.googleAccessToken = '';
                        this.settings.googleRefreshToken = '';
                        this.settings.googleTokenExpiry = undefined;
                        await this.onSettingsChange(this.settings);
                        throw new Error('Failed to refresh token - please reconnect your account');
                    }
                }

                // For other errors (network, server issues), keep the refresh token
                throw new Error('Failed to refresh token - please try again later');
            }

            // At this point we know we have a successful response with JSON data
            const data = errorData as any; // Reuse the parsed response
            if (!data.access_token) {
                throw new Error('Invalid response from token endpoint');
            }

            // Update tokens and expiry
            this.settings.googleAccessToken = data.access_token;
            this.settings.googleTokenExpiry = Date.now() + (data.expires_in * 1000);
            // Only update refresh token if we got a new one
            if (data.refresh_token) {
                this.settings.googleRefreshToken = data.refresh_token;
            }
            await this.onSettingsChange(this.settings);
        } catch (error) {
            // Only clear tokens and rethrow for specific OAuth errors
            if (error instanceof Error && error.message.includes('please reconnect')) {
                throw error;
            }
            // For other errors, keep the refresh token and throw a retriable error
            throw new Error('Failed to refresh token - please try again later');
        }
    }

    public async refreshTokenIfNeeded(): Promise<void> {
        // Check if we have any authentication tokens
        if (!this.settings.googleAccessToken && !this.settings.googleRefreshToken) {
            throw new Error('Not authenticated with Google Fit. Please disconnect and reconnect your account.');
        }

        const now = Date.now();
        const expiryTime = this.settings.googleTokenExpiry || 0;
        const refreshBuffer = 300000; // 5 minutes in milliseconds

        // Attempt refresh if:
        // 1. No access token exists
        // 2. Token is expired or about to expire
        // 3. Token expiry time is missing (shouldn't happen, but handle it)
        if (!this.settings.googleAccessToken || !this.settings.googleTokenExpiry || (now >= expiryTime - refreshBuffer)) {
            if (!this.settings.googleRefreshToken) {
                // Only clear access token and expiry if refresh token is missing
                this.settings.googleAccessToken = undefined;
                this.settings.googleTokenExpiry = undefined;
                await this.onSettingsChange(this.settings);
                throw new Error('Not authenticated with Google Fit. Please disconnect and reconnect your account.');
            }

            let retryCount = 2;
            let lastError: Error | undefined;

            while (retryCount > 0) {
                try {
                    await this.refreshAccessToken();
                    // Success - exit retry loop
                    return;
                } catch (error) {
                    lastError = error as Error;
                    retryCount--;

                    // Don't retry if it's an auth error (invalid/expired refresh token)
                    if (error instanceof Error && error.message.includes('please reconnect')) {
                        throw error;
                    }

                    // For other errors (network, etc.), retry after a delay if we have retries left
                    if (retryCount > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }

            // If we get here, all retries failed
            if (lastError) {
                throw lastError;
            }
        }
    }

    async getMeasurements(startTime: number, endTime: number): Promise<GoogleFitMeasurement[]> {
        await this.rateLimit();
        await this.refreshTokenIfNeeded();

        try {
            // Convert Unix timestamps to nanoseconds
            const startTimeNs = startTime * 1000000000;
            const endTimeNs = endTime * 1000000000;

            // Get weight data
            const weightResponse = await request({
                url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merge_weight/datasets/${startTimeNs}-${endTimeNs}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const weightData = JSON.parse(weightResponse);
            const measurements: GoogleFitMeasurement[] = [];

            // Process weight data
            if (weightData.point && weightData.point.length > 0) {
                for (const point of weightData.point) {
                    const timestamp = Math.floor(parseInt(point.startTimeNanos) / 1000000000);
                    const measurement = {
                        date: timestamp,
                        weight: point.value[0].fpVal
                    };
                    measurements.push(measurement);
                }
            }

            // Get body fat data
            const bodyFatResponse = await request({
                url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.body.fat.percentage:com.google.android.gms:merge_body_fat_percentage/datasets/${startTimeNs}-${endTimeNs}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const bodyFatData = JSON.parse(bodyFatResponse);

            // Process body fat data
            if (bodyFatData.point && bodyFatData.point.length > 0) {
                for (const point of bodyFatData.point) {
                    const timestamp = Math.floor(parseInt(point.startTimeNanos) / 1000000000);
                    const measurement = measurements.find(m => m.date === timestamp);

                    if (measurement) {
                        measurement.bodyFat = point.value[0].fpVal;
                    } else {
                        const newMeasurement = {
                            date: timestamp,
                            bodyFat: point.value[0].fpVal
                        };
                        measurements.push(newMeasurement);
                    }
                }
            }

            return measurements;
        } catch (error) {
            new Notice('Failed to fetch measurements from Google Fit');
            throw error;
        }
    }

    async addMeasurement(date: number, weight: number, bodyFat?: number): Promise<void> {
        await this.rateLimit();
        await this.refreshTokenIfNeeded();

        const nanos = `${date}000000000`;

        try {
            // Add weight measurement
            await request({
                url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.weight:com.google.android.gms:merge_weight/datasets/${nanos}-${nanos}`,
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    dataSourceId: 'derived:com.google.weight:com.google.android.gms:merge_weight',
                    point: [{
                        startTimeNanos: nanos,
                        endTimeNanos: nanos,
                        dataTypeName: 'com.google.weight',
                        value: [{
                            fpVal: weight
                        }]
                    }]
                })
            });

            // Add body fat measurement if provided
            if (bodyFat !== undefined) {
                await request({
                    url: `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.body.fat.percentage:com.google.android.gms:merge_body_fat_percentage/datasets/${nanos}-${nanos}`,
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${this.settings.googleAccessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        dataSourceId: 'derived:com.google.body.fat.percentage:com.google.android.gms:merge_body_fat_percentage',
                        point: [{
                            startTimeNanos: nanos,
                            endTimeNanos: nanos,
                            dataTypeName: 'com.google.body.fat.percentage',
                            value: [{
                                fpVal: bodyFat
                            }]
                        }]
                    })
                });
            }

            new Notice('Measurements added to Google Fit');
        } catch (error) {
            new Notice('Failed to add measurements to Google Fit');
            throw error;
        }
    }
}