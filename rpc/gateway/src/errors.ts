export class RpcGatewayError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}
