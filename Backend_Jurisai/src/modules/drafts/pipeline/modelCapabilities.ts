/**
 * Newer models reject sampling parameters (temperature/top_p/top_k) with a 400; for them,
 * output variance is governed by `effort` and the prompt instead. Everything else accepts them.
 */
const REJECTS_SAMPLING = /^claude-(sonnet-5|opus-5|opus-4-[78]|fable|mythos)/;
export const acceptsSamplingParams = (model: string) => !REJECTS_SAMPLING.test(model);

/** `output_config.effort` errors on Haiku 4.5 / Sonnet 4.5 and older. */
const ACCEPTS_EFFORT = /^claude-(opus-4-[5-9]|opus-5|sonnet-5|sonnet-4-6|fable|mythos)/;
export const acceptsEffort = (model: string) => ACCEPTS_EFFORT.test(model);
