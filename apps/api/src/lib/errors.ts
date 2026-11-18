/** Error carrying a stable `code` and a pt-BR `message`, rendered as ApiError by the global error handler. */
export class ApiHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

export const unauthorized = (message = "Faça login para continuar.") => new ApiHttpError(401, "unauthorized", message);
export const forbidden = (message = "Você não tem permissão para esta ação.") => new ApiHttpError(403, "forbidden", message);
export const notFound = (message = "Recurso não encontrado.") => new ApiHttpError(404, "not_found", message);
export const badRequest = (code: string, message: string, details?: unknown) => new ApiHttpError(400, code, message, details);
export const conflict = (code: string, message: string, details?: unknown) => new ApiHttpError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) => new ApiHttpError(422, code, message, details);
