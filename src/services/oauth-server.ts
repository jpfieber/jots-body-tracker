import { Notice, App } from 'obsidian';

interface OAuthCallbackParams {
    code: string;
    state: string;
}

declare global {
    interface Window {
        require: any;
    }
}

export class OAuthCallbackServer {
    private callbackPromise: Promise<OAuthCallbackParams> | null = null;
    private callbackResolver: ((value: OAuthCallbackParams) => void) | null = null;
    private server: any = null;
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    async start(): Promise<void> {
        if (this.server) {
            console.log('OAuth server already running');
            return;
        }

        try {
            const http = window.require('http');

            this.server = http.createServer((req: any, res: any) => {
                try {
                    console.log('Received request:', req.url);
                    
                    // Always parse URL relative to localhost
                    const parsedUrl = new URL(req.url, 'http://localhost:16321');
                    console.log('Parsed URL:', {
                        pathname: parsedUrl.pathname,
                        search: parsedUrl.search
                    });

                    // Check if this is the callback path
                    if (parsedUrl.pathname === '/callback') {
                        const params = parsedUrl.searchParams;
                        const code = params.get('code');
                        const state = params.get('state');

                        console.log('Processing OAuth callback:', {
                            hasCode: !!code,
                            hasState: !!state,
                            path: parsedUrl.pathname
                        });

                        if (code && state) {
                            this.handleCallback(params);
                            res.writeHead(200, { 
                                'Content-Type': 'text/html',
                                'Connection': 'close'
                            });
                            res.end(`
                                <html>
                                    <head>
                                        <title>Authentication Successful</title>
                                        <style>
                                            body { 
                                                font-family: Arial, sans-serif; 
                                                text-align: center; 
                                                padding-top: 50px;
                                                background-color: #f5f6f8;
                                            }
                                            .container {
                                                max-width: 600px;
                                                margin: 0 auto;
                                                padding: 20px;
                                                background: white;
                                                border-radius: 8px;
                                                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                                            }
                                            h1 { 
                                                color: #4CAF50; 
                                                margin-bottom: 20px;
                                            }
                                            p { 
                                                margin: 20px 0;
                                                color: #666;
                                            }
                                        </style>
                                    </head>
                                    <body>
                                        <div class="container">
                                            <h1>Authentication Successful!</h1>
                                            <p>You can close this window and return to Obsidian.</p>
                                        </div>
                                    </body>
                                </html>
                            `);
                        } else {
                            res.writeHead(400, { 
                                'Content-Type': 'text/html',
                                'Connection': 'close'
                            });
                            res.end(`
                                <html>
                                    <head>
                                        <title>Authentication Failed</title>
                                        <style>
                                            body { 
                                                font-family: Arial, sans-serif; 
                                                text-align: center; 
                                                padding-top: 50px;
                                                background-color: #f5f6f8;
                                            }
                                            .container {
                                                max-width: 600px;
                                                margin: 0 auto;
                                                padding: 20px;
                                                background: white;
                                                border-radius: 8px;
                                                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                                            }
                                            h1 { 
                                                color: #f44336; 
                                                margin-bottom: 20px;
                                            }
                                            p { 
                                                margin: 20px 0;
                                                color: #666;
                                            }
                                        </style>
                                    </head>
                                    <body>
                                        <div class="container">
                                            <h1>Authentication Failed</h1>
                                            <p>No authorization code received. Please try again.</p>
                                        </div>
                                    </body>
                                </html>
                            `);
                        }
                    } else {
                        res.writeHead(404, { 
                            'Content-Type': 'text/html',
                            'Connection': 'close'
                        });
                        res.end('<html><body><h1>404 Not Found</h1></body></html>');
                    }
                } catch (error) {
                    console.error('Error handling OAuth callback:', error);
                    res.writeHead(500, { 
                        'Content-Type': 'text/html',
                        'Connection': 'close'
                    });
                    res.end(`
                        <html>
                            <head>
                                <title>Authentication Error</title>
                                <style>
                                    body { 
                                        font-family: Arial, sans-serif; 
                                        text-align: center; 
                                        padding-top: 50px;
                                        background-color: #f5f6f8;
                                    }
                                    .container {
                                        max-width: 600px;
                                        margin: 0 auto;
                                        padding: 20px;
                                        background: white;
                                        border-radius: 8px;
                                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                                    }
                                    h1 { 
                                        color: #f44336; 
                                        margin-bottom: 20px;
                                    }
                                    p { 
                                        margin: 20px 0;
                                        color: #666;
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h1>Authentication Error</h1>
                                    <p>An error occurred during authentication. Please try again.</p>
                                    ${error instanceof Error ? `<p style="color: #999; font-size: 0.9em;">${error.message}</p>` : ''}
                                </div>
                            </body>
                        </html>
                    `);
                }
            });

            this.server.on('error', (error: Error) => {
                console.error('OAuth server error:', error);
                if ((error as any).code === 'EADDRINUSE') {
                    console.log('Port already in use, attempting to close existing server...');
                    this.close().catch(console.error);
                }
            });

            await new Promise<void>((resolve, reject) => {
                this.server.listen(16321, 'localhost', () => {
                    console.log('OAuth callback server listening on port 16321');
                    resolve();
                });

                this.server.once('error', reject);
            });
        } catch (error) {
            console.error('Failed to start OAuth server:', error);
            throw error;
        }
    }

    handleCallback(params: URLSearchParams): void {
        const code = params.get('code');
        const state = params.get('state');

        if (!code || !state) {
            console.error('Invalid callback parameters:', { 
                hasCode: !!code, 
                hasState: !!state,
                params: Object.fromEntries(params.entries())
            });
            if (this.callbackResolver) {
                this.callbackResolver({ code: '', state: '' });
            }
            new Notice('Failed to process OAuth callback - missing parameters');
            return;
        }

        if (!this.callbackResolver) {
            console.error('No callback resolver available');
            new Notice('Failed to process OAuth callback - no resolver');
            return;
        }

        console.log('Processing OAuth callback with valid code and state');
        this.callbackResolver({ code, state });
    }

    waitForCallback(): Promise<OAuthCallbackParams> {
        if (this.callbackPromise) {
            return this.callbackPromise;
        }

        this.callbackPromise = new Promise((resolve) => {
            this.callbackResolver = resolve;

            // Set a timeout to prevent hanging
            const timeoutId = setTimeout(() => {
                if (this.callbackResolver) {
                    console.error('OAuth callback timeout after 5 minutes');
                    new Notice('OAuth callback timeout. Please try again.');
                    resolve({ code: '', state: '' });
                    this.close().catch(console.error);
                }
            }, 300000); // 5 minute timeout

            // Clean up timeout when promise resolves
            this.callbackPromise?.finally(() => {
                clearTimeout(timeoutId);
            });
        });

        return this.callbackPromise;
    }

    async close(): Promise<void> {
        if (this.server) {
            try {
                await new Promise<void>((resolve, reject) => {
                    this.server.close((err?: Error) => {
                        if (err) {
                            console.error('Error closing OAuth server:', err);
                            reject(err);
                        } else {
                            console.log('OAuth callback server closed');
                            resolve();
                        }
                    });
                });
            } catch (error) {
                console.error('Failed to close OAuth server:', error);
            } finally {
                this.server = null;
                this.callbackPromise = null;
                this.callbackResolver = null;
            }
        }
    }
}