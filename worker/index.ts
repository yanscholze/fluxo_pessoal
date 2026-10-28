/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ensureMigrated } from "../server/db/migrator.ts";
import { runScheduledFinancialAnalyses } from "../server/services/ai/analysis.ts";
import { attachRequestMetrics, logRequestMetrics, withRequestMetrics } from "../server/observability/request-metrics.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async scheduled(_controller: { scheduledTime: number }, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        await ensureMigrated();
        const outcome = await runScheduledFinancialAnalyses(new Date());
        if (outcome.failed) console.warn("Fluxo scheduled", { processed: outcome.processed, failed: outcome.failed });
      } catch {
        // No provider payloads or credentials: failure here is migration/account selection.
        console.error("Fluxo: falha ao iniciar análise agendada", { code: "scheduled_failed" });
        throw new Error("Fluxo scheduled_failed");
      }
    })());
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return withRequestMetrics(async () => {
      const response = await handler.fetch(request, env, ctx);
      logRequestMetrics(response.status);
      return attachRequestMetrics(response);
    }, request);
  },
};

export default worker;
