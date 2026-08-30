import { ExpressionContext, ReleaseDecision } from "./contracts";
import { compilePhenotype, decideRightToRelease } from "./runtime";

export interface EffectorRequest<TPayload = unknown> {
  effectorId: string;
  payload: TPayload;
}

export interface EffectorReceipt<TResult = unknown> {
  effectorId: string;
  executed: boolean;
  result?: TResult;
  release: ReleaseDecision;
}

export type EffectorExecutor<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
) => Promise<TResult> | TResult;

export interface HostEffectorRegistry {
  [effectorId: string]: EffectorExecutor;
}

/**
 * The only supported actuation boundary for an integrated host.
 * A host adapter MUST route every external/native effector through this class.
 * If an effector is not present in the compiled phenotype, or any release gate
 * fails, execution is denied before the executor is called.
 */
export class GenomeExpressionHostAdapter {
  constructor(
    private readonly contextProvider: () => Promise<ExpressionContext> | ExpressionContext,
    private readonly registry: HostEffectorRegistry,
  ) {}

  async execute<TPayload = unknown, TResult = unknown>(
    request: EffectorRequest<TPayload>,
  ): Promise<EffectorReceipt<TResult>> {
    const context = await this.contextProvider();
    const phenotype = compilePhenotype(context);

    if (!phenotype.effectors.includes(request.effectorId)) {
      return {
        effectorId: request.effectorId,
        executed: false,
        release: {
          allowed: false,
          reason: "effector-not-authorized-by-compiled-phenotype",
          blockedEffectors: [request.effectorId],
        },
      };
    }

    const release = decideRightToRelease(context, phenotype);
    if (!release.allowed) {
      return { effectorId: request.effectorId, executed: false, release };
    }

    const executor = this.registry[request.effectorId];
    if (!executor) {
      return {
        effectorId: request.effectorId,
        executed: false,
        release: {
          allowed: false,
          reason: "authorized-effector-has-no-host-executor",
          blockedEffectors: [request.effectorId],
        },
      };
    }

    const result = await executor(request.payload);
    return {
      effectorId: request.effectorId,
      executed: true,
      result: result as TResult,
      release,
    };
  }
}
