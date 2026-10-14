import type { IImportPreprocessor } from '$lib/types';
import { reclassifyInboundAsBuys } from '$lib/preprocessors/reclassify-inbound-as-buys';

export { reclassifyInboundAsBuys };

/** Preprocessors addressable by id, so data-defined importers can reference them. */
export const PREPROCESSORS: Readonly<Record<string, IImportPreprocessor>> = {
  [reclassifyInboundAsBuys.id]: reclassifyInboundAsBuys,
};
