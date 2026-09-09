/**
 * Core domain types for the Vibe trading system.
 *
 * All types defined here are shared between the main process,
 * renderer process, and Python bridge.
 */

// ---------------------------------------------------------------------------
// Market data types
// ---------------------------------------------------------------------------

/** Candle / OHLCV bar data */
export interface CandleData {
  /** Unix timestamp in milliseconds */
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Tick / level-1 market data */
export interface TickData {
  /** Unix timestamp in milliseconds */
  timestamp: number
  symbol: string
  /** Best bid price */
  bidPrice: number
  /** Best bid quantity */
  bidSize: number
  /** Best ask price */
  askPrice: number
  /** Best ask quantity */
  askSize: number
  /** Last traded price */
  lastPrice: number
  /** 24h change percentage */
  change24h?: number
  /** 24h volume */
  volume24h?: number
}

/** Order book level */
export interface OrderBookLevel {
  price: number
  quantity: number
}

/** L2 order book snapshot */
export interface OrderBookData {
  symbol: string
  timestamp: number
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
}

/** Public trade data */
export interface TradeData {
  id: string
  symbol: string
  price: number
  quantity: number
  side: OrderSide
  timestamp: number
}

// ---------------------------------------------------------------------------
// Order types
// ---------------------------------------------------------------------------

/** Order side - buy or sell */
export type OrderSide = 'buy' | 'sell'

/** Order type - market, limit, etc. */
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit'

/** Order status lifecycle */
export type OrderStatus =
  | 'pending'
  | 'submitted'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired'

/** Time in force for orders */
export type TimeInForce = 'gtc' | 'ioc' | 'fok'

/** Order request - used for creating new orders */
export interface OrderRequest {
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  /** Price for limit/stop orders (optional for market orders) */
  price?: number
  /** Stop price for stop orders */
  stopPrice?: number
  timeInForce?: TimeInForce
  /** Client-assigned order ID for idempotency */
  clientOrderId?: string
  /** Optional metadata / tags */
  metadata?: Record<string, unknown>
}

/** Order - represents an order in the system */
export interface Order {
  id: string
  clientOrderId?: string
  symbol: string
  exchange: string
  side: OrderSide
  type: OrderType
  quantity: number
  filledQuantity: number
  price?: number
  stopPrice?: number
  averagePrice?: number
  status: OrderStatus
  timeInForce: TimeInForce
  /** Timestamp when order was created */
  createdAt: number
  /** Timestamp of last update */
  updatedAt: number
  /** Fee charged for this order */
  fee?: number
  /** Fee currency / asset */
  feeCurrency?: string
  /** Rejection reason if status is rejected */
  rejectReason?: string
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Position and account types
// ---------------------------------------------------------------------------

/** Position data */
export interface Position {
  symbol: string
  exchange: string
  /** Position quantity (positive = long, negative = short) */
  quantity: number
  /** Average entry price */
  averagePrice: number
  /** Current mark price */
  markPrice?: number
  /** Unrealized PnL */
  unrealizedPnl?: number
  /** Unrealized PnL percentage */
  unrealizedPnlPercent?: number
  /** Position size in quote currency */
  notional?: number
  /** Leverage for futures positions */
  leverage?: number
  /** Liquidation price */
  liquidationPrice?: number
  /** Last update timestamp */
  updatedAt: number
}

/** Account balance */
export interface Balance {
  asset: string
  exchange: string
  /** Total balance */
  total: number
  /** Available (free) balance */
  available: number
  /** Balance locked in orders / positions */
  locked: number
  /** USD value (optional) */
  usdValue?: number
}

/** Account / wallet summary */
export interface AccountInfo {
  exchange: string
  /** Total equity in USD */
  totalEquity?: number
  /** Unrealized PnL */
  unrealizedPnl?: number
  /** Available balance in USD */
  availableBalance?: number
  balances: Balance[]
  positions: Position[]
  /** Last update timestamp */
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Exchange / chain types
// ---------------------------------------------------------------------------

/** Exchange identifier */
export interface ExchangeId {
  /** Exchange name (e.g., 'binance', 'okx') */
  name: string
  /** Exchange type */
  type: 'cex' | 'dex' | 'chain'
  /** Supported networks / chains */
  networks?: string[]
}

/** Market instrument / symbol */
export interface Instrument {
  symbol: string
  exchange: string
  /** Base asset (e.g., 'BTC' in BTC/USDT) */
  baseAsset: string
  /** Quote asset (e.g., 'USDT' in BTC/USDT) */
  quoteAsset: string
  /** Market type */
  type: 'spot' | 'futures' | 'option' | 'stock_token'
  /** Price tick size / precision */
  pricePrecision: number
  /** Quantity tick size / precision */
  quantityPrecision: number
  /** Minimum order quantity */
  minQuantity?: number
  /** Minimum order notional value */
  minNotional?: number
  /** Maximum leverage for futures */
  maxLeverage?: number
}

/** Stock token - represents a stock traded on a blockchain */
export interface StockToken {
  /** Ticker symbol (e.g., 'TSLA') */
  ticker: string
  /** Full company name */
  name: string
  /** Chain / network the token is on */
  chain: string
  /** Token contract address */
  contractAddress: string
  /** Exchange / DEX where it trades */
  exchange: string
  /** Trading pair (e.g., TSLA/USDC) */
  pair: string
  /** Collateral mechanism */
  collateralType: 'oracle' | 'amm_pool' | 'custodial' | 'other'
  /** Current price */
  price?: number
  /** 24h volume */
  volume24h?: number
  /** Market cap / TVL */
  tvl?: number
}

// ---------------------------------------------------------------------------
// Strategy types
// ---------------------------------------------------------------------------

/** Strategy identifier and metadata */
export interface StrategyInfo {
  id: string
  name: string
  description: string
  version: string
  /** Strategy category */
  category: 'arbitrage' | 'trend' | 'mean_reversion' | 'market_making' | 'other'
  /** Supported market types */
  supportedMarkets: Array<'spot' | 'futures' | 'stock_token'>
  /** Whether the strategy supports live trading */
  supportsLive: boolean
  /** Whether the strategy supports backtesting */
  supportsBacktest: boolean
  /** Default parameters */
  defaultParams: Record<string, StrategyParam>
  /** Author */
  author?: string
  /** Tags for filtering / discovery */
  tags?: string[]
}

/** Strategy parameter definition */
export interface StrategyParam {
  type: 'number' | 'string' | 'boolean' | 'number_array'
  label: string
  description?: string
  defaultValue: unknown
  /** Minimum value for numeric params */
  min?: number
  /** Maximum value for numeric params */
  max?: number
  /** Step size for numeric params */
  step?: number
  /** Allowed options for string params */
  options?: string[]
  /** Whether the parameter can be optimized */
  optimizable?: boolean
}

/** Strategy instance (running or stopped) */
export interface StrategyInstance {
  id: string
  strategyId: string
  name: string
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error'
  /** Symbol(s) the strategy is trading on */
  symbols: string[]
  /** Current parameter values */
  params: Record<string, unknown>
  /** Strategy mode */
  mode: 'paper' | 'live' | 'backtest'
  /** PnL since start */
  pnl?: number
  /** PnL percentage */
  pnlPercent?: number
  /** When the strategy was started */
  startedAt?: number
  /** When the strategy was last stopped */
  stoppedAt?: number
  errorMessage?: string
}

// ---------------------------------------------------------------------------
// Backtest types
// ---------------------------------------------------------------------------

/** Backtest configuration */
export interface BacktestConfig {
  strategyId: string
  params: Record<string, unknown>
  symbols: string[]
  /** Start date as ISO string or timestamp */
  startDate: string | number
  /** End date as ISO string or timestamp */
  endDate: string | number
  /** Starting capital in quote currency */
  initialCapital: number
  /** Trading fee rate (e.g., 0.001 = 0.1%) */
  feeRate: number
  /** Slippage rate (e.g., 0.0005 = 0.05%) */
  slippageRate: number
  /** Timeframe for candle data */
  timeframe: string
}

/** Backtest result statistics */
export interface BacktestResult {
  /** Total return percentage */
  totalReturn: number
  /** Annualized return */
  annualReturn: number
  /** Max drawdown percentage */
  maxDrawdown: number
  /** Sharpe ratio (annualized) */
  sharpeRatio: number
  /** Sortino ratio */
  sortinoRatio: number
  /** Calmar ratio */
  calmarRatio: number
  /** Win rate (percentage of winning trades) */
  winRate: number
  /** Profit factor */
  profitFactor: number
  /** Total number of trades */
  totalTrades: number
  /** Average trade PnL */
  avgTradePnl: number
  /** Best trade PnL */
  bestTrade: number
  /** Worst trade PnL */
  worstTrade: number
  /** Maximum number of consecutive losing trades */
  maxConsecutiveLosses: number
  /** Final equity value */
  finalEquity: number
  /** Peak equity value */
  peakEquity: number
}

/** Equity curve data point */
export interface EquityPoint {
  timestamp: number
  equity: number
  drawdown: number
}

/** Completed backtest */
export interface BacktestReport {
  config: BacktestConfig
  result: BacktestResult
  equityCurve: EquityPoint[]
  /** List of closed trades */
  trades: TradeRecord[]
  /** Generated timestamp */
  generatedAt: number
}

/** Individual trade record */
export interface TradeRecord {
  id: string
  symbol: string
  side: OrderSide
  /** Entry price */
  entryPrice: number
  /** Exit price */
  exitPrice: number
  /** Position size */
  quantity: number
  /** PnL in quote currency */
  pnl: number
  /** PnL percentage */
  pnlPercent: number
  /** Entry timestamp */
  entryTime: number
  /** Exit timestamp */
  exitTime: number
  /** Duration in milliseconds */
  duration: number
  /** Trade fees */
  fees: number
  /** Optional strategy signal / reason */
  reason?: string
}

// ---------------------------------------------------------------------------
// Wallet types
// ---------------------------------------------------------------------------

/** Wallet info */
export interface WalletInfo {
  id: string
  name: string
  /** Chain / network */
  chain: string
  /** Wallet address */
  address: string
  /** Wallet type */
  type: 'mnemonic' | 'private_key' | 'hardware' | 'watch_only'
  /** Whether this wallet can sign transactions */
  canSign: boolean
  /** Native token balance */
  nativeBalance?: number
  /** Last update timestamp */
  updatedAt: number
}

/** Chain / network info */
export interface ChainInfo {
  id: string
  name: string
  /** Chain ID (EVM chains) */
  chainId?: number
  /** Native token symbol */
  nativeToken: string
  /** Type of chain */
  type: 'evm' | 'solana' | 'sui' | 'cosmos' | 'other'
  /** Block explorer URL */
  explorerUrl?: string
  /** Average block time in seconds */
  blockTime?: number
}

// ---------------------------------------------------------------------------
// Agent / AI types
// ---------------------------------------------------------------------------

/** Agent role / persona */
export interface AgentPersona {
  id: string
  name: string
  description: string
  /** System prompt / instructions */
  systemPrompt: string
  /** Default model */
  defaultModel?: string
  /** Whether this agent can execute trades */
  canExecute: boolean
  /** Risk tolerance level */
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
  /** Tools available to this agent */
  tools: string[]
}

/** Agent execution request from AI */
export interface AgentTradeProposal {
  /** Proposal ID */
  id: string
  /** Agent that generated the proposal */
  agentId: string
  /** Type of proposal */
  type: 'trade' | 'strategy_start' | 'strategy_stop' | 'portfolio_rebalance'
  /** Short summary / title */
  summary: string
  /** Detailed reasoning */
  reasoning: string
  /** Confidence level 0-1 */
  confidence: number
  /** Associated order requests (if trade type) */
  orders?: OrderRequest[]
  /** Strategy ID if strategy-related */
  strategyId?: string
  /** Risk warnings */
  riskWarnings?: string[]
  /** When the proposal was generated */
  createdAt: number
  /** Expiration time for the proposal */
  expiresAt?: number
}

/** Human decision on a trade proposal */
export type HumanDecision = 'approved' | 'rejected' | 'modified' | 'delayed'

// ---------------------------------------------------------------------------
// Event types (for IPC / pub-sub)
// ---------------------------------------------------------------------------

/** Event types emitted by the trading system */
export type SystemEvent =
  | { type: 'tick'; data: TickData }
  | { type: 'candle'; data: CandleData; symbol: string }
  | { type: 'order_update'; data: Order }
  | { type: 'trade_executed'; data: TradeData }
  | { type: 'position_update'; data: Position }
  | { type: 'balance_update'; data: Balance }
  | { type: 'strategy_update'; data: StrategyInstance }
  | { type: 'agent_proposal'; data: AgentTradeProposal }
  | { type: 'error'; source: string; message: string; level: 'warning' | 'error' | 'fatal' }
  | { type: 'connection_status'; source: string; connected: boolean }
