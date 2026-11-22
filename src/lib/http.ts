import { ZodError } from "zod";
import { AppError } from "./errors";
import { zodMessage } from "./validation";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function errorJson(status: number, message: string): Response {
  return json({ error: message }, status);
}

/** Turns thrown AppError and ZodError into JSON responses. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) return errorJson(e.status, e.message);
    if (e instanceof ZodError) return errorJson(400, zodMessage(e));
    console.error(e);
    return errorJson(500, "Something went wrong. Please try again.");
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, "Body must be JSON");
  }
}
