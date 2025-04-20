import { requestUrl, RequestUrlParam } from 'obsidian';
import type { Settings } from '../types';

interface WithingsAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
}

interface WithingsTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    userid: string;
}

interface WithingsMeasurement {
    date: number;
    weight: number;
    fat_ratio?: number;
    fat_mass?: number;
    lean_mass?: number;
}

interface WithingsServiceConfig extends WithingsAuthConfig {
    onSettingsChange: (settings: Settings) => Promise<void>;
}

export class WithingsService {
    private accessToken?: string;
    private refreshToken?: string;
    private tokenExpiry?: number;
    private lastRequestTime = 0;
    private readonly minRequestInterval = 1000; // 1 second between requests

    constructor(
        private settings: Settings,
        private config: WithingsServiceConfig
    ) {
        // Initialize tokens from settings if they exist
        this.accessToken = settings.withingsAccessToken;
        this.refreshToken = settings.withingsRefreshToken;
        this.tokenExpiry = settings.withingsTokenExpiry;
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

    private async handleApiError(error: any): never {
        console.error('Withings API error:', error);
        let message = 'Failed to connect to Withings';

        if (error.response) {
            const status = error.response.status;
            switch (status) {
                case 401:
                    message = 'Authentication failed. Please re-authenticate with Withings.';
                    break;
                case 429:
                    message = 'Too many requests. Please try again later.';
                    break;
                case 503:
                    message = 'Withings service is temporarily unavailable.';
                    break;
                default:
                    message = `API error (${status}): ${error.message}`;
            }
        }

        new Notice(message, 5000);
        throw new Error(message);
    }

    async authenticate(): Promise<boolean> {
        // Generate a random state value for security
        const state = Math.random().toString(36).substring(7);

        // Store state temporarily to verify when handling redirect
        this.settings.withingsAuthState = state;
        await this.config.onSettingsChange(this.settings);

        // Construct the auth URL with all required parameters
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.settings.withingsRedirectUri,
            scope: 'user.metrics',
            state: state
        });

        console.log('Authorization parameters (without sensitive data):', {
            ...Object.fromEntries(params),
            client_id: '[REDACTED]'
        });

        const authUrl = `https://account.withings.com/oauth2_user/authorize2?${params.toString()}`;

        console.log('Authorization URL (without credentials):',
            authUrl.replace(this.config.clientId, '[REDACTED]')
        );

        // Open auth URL in default browser
        window.open(authUrl);

        // Show detailed instructions to user
        new Notice(
            'Withings Authentication:\n\n' +
            '1. Complete authorization in your browser\n' +
            '2. After authorizing, you will be redirected\n' +
            '3. Copy both the "code" and "state" parameters from the redirect URL\n' +
            '4. Use Command Palette and run "Complete Withings Authentication"\n' +
            '5. Paste the code and state in the dialog\n\n' +
            'The redirect URL will look like:\n' +
            `${this.settings.withingsRedirectUri}?code=XXXX&state=YYYY`,
            20000  // Show for 20 seconds
        );

        return true;
    }

    async completeAuthentication(code: string, state: string): Promise<boolean> {
        // Verify state matches what we stored
        if (state !== this.settings.withingsAuthState) {
            throw new Error('Invalid authentication state');
        }

        try {
            await this.rateLimit();

            console.log('Starting token request with code:', code);

            // Construct request parameters
            const params = {
                action: 'requesttoken',
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: this.config.redirectUri
            };

            console.log('Token request parameters:', params);

            const reqBody = new URLSearchParams(params).toString();
            console.log('Request body:', reqBody);

            const response = await requestUrl({
                url: 'https://wbsapi.withings.net/v2/oauth2',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: reqBody
            });

            console.log('Raw response:', response);
            console.log('Response status:', response.status);
            console.log('Response body:', response.json);

            if (response.status !== 200) {
                throw new Error(`HTTP error ${response.status}: ${JSON.stringify(response.json)}`);
            }

            if (!response.json?.body?.access_token) {
                throw new Error('Invalid response format: ' + JSON.stringify(response.json));
            }

            const data = response.json.body;
            console.log('Parsed token response:', {
                ...data,
                access_token: '[REDACTED]',
                refresh_token: '[REDACTED]'
            });

            // Store tokens
            this.accessToken = data.access_token;
            this.refreshToken = data.refresh_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            // Save to settings
            this.settings.withingsAccessToken = this.accessToken;
            this.settings.withingsRefreshToken = this.refreshToken;
            this.settings.withingsTokenExpiry = this.tokenExpiry;
            await this.config.onSettingsChange(this.settings);

            new Notice('Successfully connected to Withings!');
            return true;
        } catch (error) {
            console.error('Withings token request error:', {
                error,
                message: error.message,
                response: error.response,
                stack: error.stack
            });

            // Try to extract detailed error information
            let errorMessage = 'Failed to complete authentication';
            if (error.response?.json?.error) {
                errorMessage += `: ${error.response.json.error}`;
            } else if (error.message) {
                errorMessage += `: ${error.message}`;
            }

            new Notice(errorMessage, 10000);
            throw error;
        }
    }

    private async refreshAccessToken(): Promise<boolean> {
        if (!this.refreshToken) return false;

        try {
            const response = await requestUrl({
                url: 'https://wbsapi.withings.net/v2/oauth2',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    action: 'requesttoken',
                    grant_type: 'refresh_token',
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    refresh_token: this.refreshToken,
                    scope: 'user.metrics,user.activity'
                }).toString()
            });

            const data: WithingsTokenResponse = response.json.body;
            this.accessToken = data.access_token;
            this.refreshToken = data.refresh_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            return true;
        } catch (error) {
            console.error('Failed to refresh token:', error);
            return false;
        }
    }

    async getMeasurements(startDate: number, endDate: number): Promise<WithingsMeasurement[]> {
        if (!this.accessToken || (this.tokenExpiry && Date.now() > this.tokenExpiry)) {
            const refreshed = await this.refreshAccessToken();
            if (!refreshed) {
                throw new Error('Failed to refresh access token');
            }
        }

        try {
            const response = await requestUrl({
                url: 'https://wbsapi.withings.net/measure',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    action: 'getmeas',
                    startdate: startDate.toString(),
                    enddate: endDate.toString(),
                    meastypes: '1,6,8' // Weight, Fat Ratio, Fat Mass
                }).toString()
            });

            // Transform the response into our measurement format
            return this.transformMeasurements(response.json.body.measuregrps);
        } catch (error) {
            console.error('Failed to fetch Withings measurements:', error);
            throw error;
        }
    }

    private transformMeasurements(measureGroups: any[]): WithingsMeasurement[] {
        return measureGroups.map(group => {
            const measurement: WithingsMeasurement = {
                date: group.date,
                weight: 0
            };

            for (const measure of group.measures) {
                switch (measure.type) {
                    case 1: // Weight
                        measurement.weight = measure.value * Math.pow(10, measure.unit);
                        break;
                    case 6: // Fat Ratio
                        measurement.fat_ratio = measure.value * Math.pow(10, measure.unit);
                        break;
                    case 8: // Fat Mass
                        measurement.fat_mass = measure.value * Math.pow(10, measure.unit);
                        break;
                }
            }

            if (measurement.fat_mass && measurement.weight) {
                measurement.lean_mass = measurement.weight - measurement.fat_mass;
            }

            return measurement;
        });
    }
}