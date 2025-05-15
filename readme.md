# 🚀 @jaac/fetch.proxy

> Cliente HTTP elegante/minimalista para gestionar múltiples servicios API

`@jaac/fetch.proxy` es una biblioteca minimalista que proporciona una forma elegante de interactuar con múltiples endpoints API REST sin repetir configuraciones o código boilerplate. Cuenta con un peso de **~4.0kb**.

```
         ┌──────────┐       ┌──────────┐
         │  API 1   │       │  API 2   │
         └────┬─────┘       └────┬─────┘
              │                  │
              │                  │
         ┌────▼──────────────────▼─────┐
         │                             │
         │      @jaac/fetch.proxy      │
         │                             │
         └───────────────┬─────────────┘
                         │
                         │
                    ┌────▼────┐
                    │   App   │
                    └─────────┘
```

## 📦 Instalación

```bash
# Usando yarn
yarn add @jaac/fetch.proxy
```

```bash
# Usando pnpm
pnpm add @jaac/fetch.proxy
```

```bash
# Usando npm
npm install @jaac/fetch.proxy
```

## 🔍 Características

- ✅ **TypeScript**
- ✅ Soporte para todos los métodos HTTP (GET, POST, PUT, PATCH, DELETE)
- ✅ Registro de múltiples servicios API con diferente URL base
- ✅ Manejo automático de headers y opciones por servicio
- ✅ Interceptores para request y response
- ✅ Capacidad para abortar peticiones
- ✅ API chainable con sintaxis limpia
- ✅ Gestión de errores HTTP integrada
- ✅ Patrón singleton para reutilización eficiente

## 🚦 Ejemplos

### Configuración en tu proyecto

```typescript
// En un archivo infrastructure/fetch.proxy.ts
import {fetchProxy} from '@jaac/fetch.proxy';
import {STRAPI_URL, CHAT_URL} from '@/infrastructure/utility/endpoints.utility';

// Registrar servicios
fetchProxy.register('strapi', STRAPI_URL, {
  'Authorization': 'Bearer YOUR_API_TOKEN'
});

fetchProxy.register('chat', CHAT_URL);

// Exportar para uso en toda la aplicación
export const api = fetchProxy;
```

### Realizar Peticiones

```typescript
// GET request
const posts = await api.strapi.get('/posts').json();

// POST request con datos
const newPost = await api.strapi.post('/posts', {
  title: 'Teletubbies',
  content: 'La hora de los teletubbies'
}).json();

// PUT request para actualizar
await api.strapi.put(`/posts/${postId}`, {
  title: 'Enjambre de abejas'
});

// DELETE request
await api.strapi.delete(`/posts/${postId}`);

// Petición al servicio de chat
await api.chat.post('/messages', {
  text: 'Hola Mundo'
});
```

### Usando Interceptores

Los interceptores te permiten modificar las solicitudes antes de enviarlas y transformar las respuestas antes de que sean procesadas.

#### Interceptores de Solicitud (Request)

```typescript
// Añadir headers personalizados a todas las solicitudes
api.strapi.request.use(async (request: RequestInit) => {
  const headers = new Headers(request.headers);
  headers.append("x-ray-id", "1234567890");
  headers.append("x-code-id", "987654321");
  return {
    ...request,
    headers
  };
});
```

#### Interceptores de Respuesta (Response)

```typescript
// Transformar todas las respuestas para un formato estándar
api.strapi.response.use(async (response: Response) => {
  const data = await response.json();
  if (response.ok) {
    return {
      message: "Respuesta correcta",
      code: "A0001",
      data: {...data},
    };
  }
  return {
    message: "Respuesta incorrecta",
    code: "A0002",
    data: {},
  };
});
```

#### Ejemplo Completo con Interceptores

```typescript
import {fetchProxy} from '@jaac/fetch.proxy';

fetchProxy.register("demo", "https://httpbin.org", {
  "x-master-id": "1234567890",
});
const api = fetchProxy;

// Interceptor de solicitud
api.demo.request.use(async (request: RequestInit) => {
  const headers = new Headers(request.headers);
  headers.append("x-ray-id", "1234567890");
  headers.append("x-code-id", "987654321");
  return {
    ...request,
    headers
  };
});

// Interceptor de respuesta
api.demo.response.use(async (response: Response) => {
  const data = await response.json();
  if (response.ok)
    return {
      message: "Respuesta correcta",
      code: "A0001",
      data: {...data},
    };
  return {
    message: "Respuesta incorrecta",
    code: "A0002",
    data: {},
  };
});

async function main() {
  const responseNotFound = await api.demo.get("/headers-x");
  const responseData = await responseNotFound.json();
  console.log("Respuesta incorrecta:", responseData);
  
  const responseFound = await api.demo.get("/headers");
  const responseDataFound = await responseFound.json();
  console.log("Respuesta correcta:", responseDataFound);
}

main().catch(console.error);
```

### Abortar Peticiones

```typescript
// Iniciar una petición que podría tardar
const request = api.strapi.get('/large-dataset');

// En algún otro lugar (por ejemplo, cuando el usuario navega a otra página)
setTimeout(() => {
  request.abort();
}, 3000); // Abortará después de 3 segundos

try {
  const data = await request.json();
  console.log('Datos recibidos:', data);
} catch (error) {
  console.log('La petición fue abortada o falló:', error);
}
```

### Hook useDebounced

- La biblioteca es ideal para crear hooks personalizados que optimicen las llamadas a la API.
- A continuación, un hook `useDebounced` que funciona con cualquier servicio registrado:

```typescript
import {useEffect, useRef, useState} from 'react';
import {ApiPromise, ApiService} from '@jaac/fetch.proxy';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Hook para crear peticiones HTTP con debounce
 * @param service - El servicio API a utilizar (api.users, api.strapi, etc.)
 * @param method - Verbo HTTP a usar ('get', 'post', etc.)
 * @param delay - Tiempo de debounce en milisegundos
 */
export const useDebounced = <T = any>(
  service: ApiService,
  method: HttpMethod = 'get',
  delay: number = 300
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const requestRef = useRef<ApiPromise | null>(null);

  // Limpiar recursos al desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (requestRef.current) requestRef.current.abort();
    };
  }, []);

  /**
   * Ejecuta la petición con debounce
   * @param endpoint - URL del endpoint
   * @param payload - Datos para enviar (solo para POST, PUT, PATCH)
   */
  const execute = async (endpoint: string, payload?: any) => {
    // Cancelar petición anterior si existe
    if (requestRef.current) {
      requestRef.current.abort();
      requestRef.current = null;
    }
    // Cancelar timeout anterior
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoading(true);
    setError(null);
    return new Promise<T>((resolve, reject) => {
      timeoutRef.current = setTimeout(async () => {
        try {
          // Crear la petición apropiada según el verbo HTTP
          let request: ApiPromise;
          switch (method) {
            case 'post':
            case 'put':
            case 'patch':
              request = service[method](endpoint, payload);
              break;
            default:
              request = service[method](endpoint);
          }
          // Guardar referencia para posible cancelación
          requestRef.current = request;
          // Esperar y procesar respuesta
          const result = await request.json<T>();
          setData(result);
          setLoading(false);
          resolve(result);
        } catch (err) {
          // Ignorar errores de cancelación
          if ((err as Error).name !== 'AbortError') {
            setError(err as Error);
            setLoading(false);
            reject(err);
          }
        }
      }, delay);
    });
  };

  return {execute, data, loading, error};
};
```

### Ejemplos de uso de useDebounced

#### 1. Búsqueda simple con GET

```typescript
export const SearchComponent = () => {
  const {execute, data, loading} = useDebounced(api.strapi);

  const handleSearch = (query: string) => {
    execute(`/products?search=${encodeURIComponent(query)}`);
  };
  // handleSearch se puede llamar directamente desde un onChange de un input o similar
};
```

#### 2. Envío de formulario con POST

```typescript
export const FormComponent = () => {
  const {execute, loading, error} = useDebounced(api.users, 'post', 500);

  const handleSubmit = (formData: any) => {
    execute('/register', formData);
  };
  // Previene múltiples envíos accidentales
};
```

#### 3. Diferentes servicios en el mismo componente

```typescript
export const DashboardComponent = () => {
  const productSearch = useDebounced(api.products);
  const userSearch = useDebounced(api.users);
  // Ambos con debounce independiente
};
```

### Este hook de ejemplo proporciona:

- Reutilización entre diferentes servicios API
- Manejo automático de cancelaciones
- Estado de carga y errores integrado
- Tipado con TypeScript
- Flexibilidad para los verbos HTTP (GET, POST, PUT, PATCH, DELETE)

## 🔧 API Reference

### `fetchProxy.register(name, baseUrl, headers?, options?)`

Registra un nuevo servicio API.

- `name`: Nombre del servicio para referenciar
- `baseUrl`: URL base para todas las peticiones de este servicio
- `headers` (opcional): Headers por defecto para todas las peticiones
- `options` (opcional): Opciones de fetch por defecto

### `fetchProxy.unregister(name)`

Elimina un servicio API registrado previamente.

- `name`: Nombre del servicio a eliminar

### Interceptores

Cada servicio registrado tiene acceso a los siguientes interceptores:

- `.request.use(interceptor)`: Añade un interceptor que modifica la solicitud antes de enviarla
- `.response.use(interceptor)`: Añade un interceptor que transforma la respuesta antes de procesarla

### Métodos por servicio

Cada servicio registrado tiene los siguientes métodos con tipado añadido:

- `.get<T>(endpoint, options?)`: Realizar petición GET
- `.post<T>(endpoint, data?, options?)`: Realizar petición POST
- `.put<T>(endpoint, data?, options?)`: Realizar petición PUT
- `.patch<T>(endpoint, data?, options?)`: Realizar petición PATCH
- `.delete<T>(endpoint, options?)`: Realizar petición DELETE

Cada método devuelve una `ApiPromise<T>` con:

- `.abort()`: Método para cancelar la petición
- `.json()`: Método para obtener directamente los datos JSON con tipo T

## 💡 Comparación

```
Sin @jaac/fetch.proxy:                  Con @jaac/fetch.proxy:
┌─────────────────────────┐             ┌─────────────────────────┐
│ // En cada componente:  │             │ // Solo una vez:        │
│ const BASE_URL =        │             │ fetchProxy.register(    │
│   'https://api.co/v1';  │             │   'search',             │
│                         │             │   'https://api.com/v1', │
│ // Para cada petición:  │             │   { 'Auth': 'token' }   │
│ const res = await fetch(│             │ );                      │
│   `${BASE_URL}/users`,  │             │                         │
│   {                     │             │ // Para cada petición:  │
│     headers: {          │             │ const users =           │
│       'Auth': 'token'   │             │   await api             │
│     }                   │             │     .search             │
│   }                     │             │     .get('/users')      │
│ );                      │             │     .json();            │
│ const users =           │             └─────────────────────────┘
│   await res.json();     │             
└─────────────────────────┘             
```

## 📋 Instalación y Requisitos

### Requisitos

- TypeScript >= 4.5
- ES6 o superior
- Muchas ganas de seguir haciendo código más limpio y elegante

## 🤝 Contribución

- Las contribuciones son bienvenidas.
- Si encuentras un error o tienes una mejora, no dudes en abrir un issue o enviar un pull request en el [repositorio GitHub](https://github.com/privjaac/fetch).

## 📄 Licencia

[MIT](license) © [jaac](https://github.com/privjaac)
