type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type RequestInterceptor = (request: RequestInit) => RequestInit | Promise<RequestInit>
type ResponseInterceptor = (response: Response) => any | Promise<any>

interface InterceptorManager<T> {
  use(interceptor: T): void

  clear(): void

  getAll(): T[]
}

class InterceptorManagerImpl<T> implements InterceptorManager<T> {
  private interceptors: T[] = []

  use(interceptor: T): void {
    this.interceptors.push(interceptor)
  }

  clear(): void {
    this.interceptors = []
  }

  getAll(): T[] {
    return [...this.interceptors]
  }
}

interface ApiResponse<T = any> extends Response {
  json(): Promise<T>
}

interface ApiPromise<T = any> extends Promise<ApiResponse<T>> {
  abort: () => void

  json(): Promise<T>
}

interface ApiService {
  request: InterceptorManager<RequestInterceptor>
  response: InterceptorManager<ResponseInterceptor>

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
    return {...this.services}
  }

  private createApiService(baseUrl: string, headers: Record<string, string> = {}, defaultOptions: RequestInit = {}): ApiService {
    const requestInterceptors = new InterceptorManagerImpl<RequestInterceptor>()
    const responseInterceptors = new InterceptorManagerImpl<ResponseInterceptor>()

    const applyRequestInterceptors = async (requestOptions: RequestInit): Promise<RequestInit> => {
      let options = {...requestOptions}
      for (const interceptor of requestInterceptors.getAll()) {
        const interceptedOptions = await interceptor(options)
        if (interceptedOptions.headers instanceof Headers) {
          const headerEntries: Record<string, string> = {}
          interceptedOptions.headers.forEach((value, key) => headerEntries[key] = value)
          options = {
            ...interceptedOptions,
            headers: headerEntries
          }
        } else {
          options = interceptedOptions;
        }
      }
      return options;
    };

    const processResponse = async (response: Response): Promise<Response> => {
      if (responseInterceptors.getAll().length === 0) return response
      const clonedResponse = response.clone()
      let responseData
      try {
        responseData = await clonedResponse.json()
      } catch {
        responseData = null
      }
      for (const interceptor of responseInterceptors.getAll()) {
        const proxiedResponse = createResponseProxy(response, responseData)
        const result = await interceptor(proxiedResponse)
        if (result !== undefined) responseData = result
      }
      return createResponseProxy(response, responseData)
    }

    const createResponseProxy = (response: Response, data: any): Response => {
      return new Proxy(response, {
        get(target: Response, prop: string | symbol): any {
          if (prop === 'json') return () => Promise.resolve(data)
          const value = Reflect.get(target, prop)
          return typeof value === 'function' ? value.bind(target) : value
        }
      }) as Response
    }

    const createMethod = (method: HttpMethod, hasData: boolean = false) => {
      return <T = any>(endpoint: string, data?: any, options: RequestInit = {}): ApiPromise<T> => {
        const controller = new AbortController();
        const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`
        const fetchPromise = (async () => {
          let requestOptions: RequestInit = {
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
          requestOptions = await applyRequestInterceptors(requestOptions)
          let response = await fetch(url, requestOptions)
          response = await processResponse(response)
          return response as ApiResponse<T>
        })()
        const wrappedPromise = fetchPromise as ApiPromise<T>
        wrappedPromise.abort = () => controller.abort()
        wrappedPromise.json = () => fetchPromise.then(res => res.json())
        return wrappedPromise
      }
    }
    return {
      request: requestInterceptors,
      response: responseInterceptors,
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
