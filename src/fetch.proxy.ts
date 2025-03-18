type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiResponse<T = any> extends Response {
    json(): Promise<T>
}

interface ApiPromise<T = any> extends Promise<ApiResponse<T>> {
    abort: () => void

    json(): Promise<T>
}

interface ApiService {
    get<T = any>(endpoint: string, options?: RequestInit): ApiPromise<T>

    post<T = any>(endpoint: string, data?: any, options?: RequestInit): ApiPromise<T>

    put<T = any>(endpoint: string, data?: any, options?: RequestInit): ApiPromise<T>

    patch<T = any>(endpoint: string, data?: any, options?: RequestInit): ApiPromise<T>

    delete<T = any>(endpoint: string, options?: RequestInit): ApiPromise<T>
}

interface Api {
    [serviceName: string]: ApiService;
}

class ApiClient {
    private static instance: ApiClient | null = null;
    private services: Record<string, ApiService> = {};

    private constructor() {
    }

    static getInstance(): ApiClient {
        if (!ApiClient.instance) ApiClient.instance = new ApiClient();
        return ApiClient.instance;
    }

    register(name: string, baseUrl: string, headers: Record<string, string> = {}, defaultOptions: RequestInit = {}): ApiService {
        const service = this.createApiService(baseUrl, headers, defaultOptions);
        this.services[name] = service;
        return service;
    }

    unregister(name: string): void {
        delete this.services[name]
    }

    getService(name: string): ApiService | undefined {
        return this.services[name]
    }

    getAllServices(): Record<string, ApiService> {
        return { ...this.services }
    }

    private createApiService(baseUrl: string, headers: Record<string, string> = {}, defaultOptions: RequestInit = {}): ApiService {
        const createMethod = (method: HttpMethod, hasData: boolean = false) => {
            return <T = any>(endpoint: string, data?: any, options: RequestInit = {}): ApiPromise<T> => {
                const controller = new AbortController();
                const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`
                const requestOptions: RequestInit = {
                    ...defaultOptions,
                    ...options,
                    method,
                    signal: options.signal || controller.signal,
                    headers: {
                        ...headers,
                        ...(options.headers || {})
                    }
                }
                if (hasData && data !== undefined) requestOptions.body = JSON.stringify(data)
                const fetchPromise = fetch(url, requestOptions) as Promise<ApiResponse<T>>
                const wrappedPromise = fetchPromise.then(response => {
                    if (!response.ok) {
                        const error: any = new Error(`HTTP Error: ${response.status}`)
                        error.status = response.status
                        error.response = response
                        throw error
                    }
                    return response
                }) as ApiPromise<T>
                wrappedPromise.abort = () => controller.abort()
                const originalJsonMethod = wrappedPromise.then(res => res.json())
                wrappedPromise.json = () => originalJsonMethod
                return wrappedPromise
            }
        }
        return {
            get: createMethod('GET'),
            post: (endpoint, data, options) => createMethod('POST', true)(endpoint, data, options),
            put: (endpoint, data, options) => createMethod('PUT', true)(endpoint, data, options),
            patch: (endpoint, data, options) => createMethod('PATCH', true)(endpoint, data, options),
            delete: createMethod('DELETE')
        }
    }
}

const apiManager: ApiClient = ApiClient.getInstance();
export const fetchProxy = new Proxy<Api>({} as Api, {
    get(target, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined
        if (prop === 'register') return (name: string, baseUrl: string, headers?: Record<string, string>, defaultOptions?: RequestInit) => apiManager.register(name, baseUrl, headers, defaultOptions)
        if (prop === 'unregister') return (name: string) => apiManager.unregister(name)
        return apiManager.getService(prop)
    }
}) as Api & {
    register(name: string, baseUrl: string, headers?: Record<string, string>, defaultOptions?: RequestInit): ApiService;
    unregister(name: string): void;
}
