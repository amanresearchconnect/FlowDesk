export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  details?: any;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

class ApiClient {
  private getHeaders(isFormData = false): HeadersInit {
    const headers: Record<string, string> = {};
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    const token = localStorage.getItem('flowdesk_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  public async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const isFormData = options.body instanceof FormData;
    const url = endpoint.startsWith('http') ? endpoint : `/api/v1${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: {
        ...this.getHeaders(isFormData),
        ...(options.headers || {})
      }
    };

    const response = await fetch(url, config);

    if (response.status === 401) {
      // If unauthorized and not already on login page, redirect or clear
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('flowdesk_token');
        localStorage.removeItem('flowdesk_user');
      }
    }

    let payload: any = {};
    try {
      payload = await response.json();
    } catch {
      payload = { message: response.statusText };
    }

    if (!response.ok) {
      throw new Error(payload.message || payload.error || `Request failed with status ${response.status}`);
    }

    return payload as ApiResponse<T>;
  }

  public get<T = any>(endpoint: string, query?: Record<string, any>): Promise<ApiResponse<T>> {
    let url = endpoint;
    if (query) {
      const filteredQuery = Object.fromEntries(
        Object.entries(query).filter(([_, v]) => v !== undefined && v !== null && v !== '')
      );
      const params = new URLSearchParams(filteredQuery);
      if (params.toString()) {
        url += (url.includes('?') ? '&' : '?') + params.toString();
      }
    }
    return this.request<T>(url, { method: 'GET' });
  }

  public post<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body || {})
    });
  }

  public put<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body || {})
    });
  }

  public delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
