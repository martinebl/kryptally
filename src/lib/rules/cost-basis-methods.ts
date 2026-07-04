import type { CostBasisMethod } from '$lib/types/tax-rules';

export const costBasisMethodDescriptions: Record<CostBasisMethod, string> = {
  fifo: 'Sells your oldest holdings first — the most common default worldwide.',
  lifo: 'Sells your most recently acquired holdings first.',
  hifo: 'Sells your highest cost-basis holdings first, minimizing reported gains.',
  average: 'Blends the cost of every holding of an asset into one average cost, so disposals never qualify for a long-term holding exemption.',
};
