const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : d);

export function llmCost(inputTokens: number, outputTokens: number): number {
  const pin = num(process.env.LLM_PRICE_IN_PER_M, 0.3);
  const pout = num(process.env.LLM_PRICE_OUT_PER_M, 2.5);
  return (inputTokens * pin + outputTokens * pout) / 1_000_000;
}

export function dmCost(inputTokens: number): number {
  return (inputTokens * num(process.env.DM_PRICE_IN_PER_M, 0)) / 1_000_000;
}
