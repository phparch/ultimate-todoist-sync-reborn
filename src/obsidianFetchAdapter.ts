import { requestUrl } from 'obsidian';

export async function obsidianFetch(
    input: string | URL | Request,
    init?: RequestInit
): Promise<Response> {
    const url = typeof input === 'string'
        ? input
        : input instanceof URL
            ? input.toString()
            : input.url;

    const method = init?.method || 'GET';

    let headers: Record<string, string> = {};
    if (init?.headers) {
        if (init.headers instanceof Headers) {
            init.headers.forEach((value, key) => {
                headers[key] = value;
            });
        } else if (Array.isArray(init.headers)) {
            init.headers.forEach(([key, value]) => {
                headers[key] = value;
            });
        } else {
            headers = init.headers as Record<string, string>;
        }
    }

    let body: string | undefined;
    if (init?.body) {
        body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    }

    const response = await requestUrl({
        url,
        method,
        headers,
        body,
        throw: false,
    });

    return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: String(response.status),
        headers: new Headers(response.headers),
        json: () => Promise.resolve(response.json),
        text: () => Promise.resolve(typeof response.text === 'string' ? response.text : JSON.stringify(response.json)),
        clone: function () { return this; },
    } as unknown as Response;
}
