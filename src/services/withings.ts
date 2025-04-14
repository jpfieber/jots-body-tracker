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

export class WithingsService {
    private accessToken?: string;
    private refreshToken?: string;
    private tokenExpiry?: number;

    constructor(
        private settings: Settings,
        private authConfig: WithingsAuthConfig
    ) {}

    async authenticate(): Promise<boolean> {
        try {
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: this.authConfig.clientId,
                redirect_uri: this.authConfig.redirectUri,
                scope: this.authConfig.scope,
                state: 'body-tracker'
            });

            // You'll need to implement OAuth flow here
            // This usually involves opening a browser window and handling the redirect
            return true;
        } catch (error) {
            console.error('Withings authentication failed:', error);
            return false;
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
                    client_id: this.authConfig.clientId,
                    client_secret: this.authConfig.clientSecret,
                    refresh_token: this.refreshToken
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