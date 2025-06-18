export const API_BASE_URL = process.env.AGENTKIT_API_URL ?? "http://localhost:3001";

export async function apiRequest(path: string, method: string, body?: unknown): Promise<any> {
  const url = `${API_BASE_URL}${path}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.success === false) {
    throw new Error(`API request failed: ${data.error || 'Unknown error'}`);
  }

  return data;
} 