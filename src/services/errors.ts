// Service-layer errors carry an HTTP-ish status so both the CLI and the REST API can
// translate them uniformly (CLI prints the message; API maps statusCode to a response).
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = "service_error"
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = "Resource not found") {
    super(message, 404, "not_found");
  }
}

export class ConflictError extends ServiceError {
  constructor(message = "Resource conflict") {
    super(message, 409, "conflict");
  }
}

export class ValidationError extends ServiceError {
  constructor(message = "Validation failed") {
    super(message, 422, "validation_error");
  }
}
