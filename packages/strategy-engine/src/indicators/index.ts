/**
 * Technical indicators library.
 *
 * All indicators are pure functions operating on numeric arrays.
 * They return arrays of the same length as the input, with NaN
 * values for indices where the indicator hasn't warmed up yet.
 */

export { sma, smaFromCandles } from './sma'
export { ema, emaFromCandles } from './ema'
export { rsi, rsiFromCandles } from './rsi'
export { bollingerBands, bollingerBandsFromCandles } from './bollinger'
export type { BollingerResult } from './bollinger'
export { macd, macdFromCandles } from './macd'
export type { MacdResult } from './macd'
