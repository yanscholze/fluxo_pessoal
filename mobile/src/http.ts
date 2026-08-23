const INVALID_RESPONSE_MESSAGE = "O servidor respondeu em um formato inesperado. Tente novamente.";

export class ApiResponseError extends Error {
  readonly code: "SITE_GATEWAY_REQUIRED" | "INVALID_RESPONSE";

  constructor(message: string, code: "SITE_GATEWAY_REQUIRED" | "INVALID_RESPONSE") {
    super(message);
    this.name = "ApiResponseError";
    this.code = code;
  }
}

export async function readApiResponse<T>(response: Pick<Response, "headers" | "status" | "text">): Promise<T> {
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = contentType.toLowerCase().includes("text/html") || body.trim().startsWith("<");
  if (response.status === 401 && isHtml) {
    throw new ApiResponseError("A autorização segura do servidor expirou. Conecte este aparelho novamente.", "SITE_GATEWAY_REQUIRED");
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiResponseError(INVALID_RESPONSE_MESSAGE, "INVALID_RESPONSE");
  }
}
