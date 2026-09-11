import { createDefaultDataSources } from './src'
import { DEFAULT_STOCK_TICKERS } from '@vibe/shared'
async function main() {
  const ds = await createDefaultDataSources()
  const agg = ds.aggregator
  const t0 = Date.now()
  const symbols = DEFAULT_STOCK_TICKERS
  let total = 0
  const per = []
  for (let i = 0; i < symbols.length; i += 4) {
    const batch = symbols.slice(i, i + 4)
    const results = await Promise.all(batch.map(async (s) => {
      try { const all = await agg.getTicksAll(s); return { s, n: all.size, ids: [...all.keys()] } }
      catch (e: any) { return { s, n: -1, ids: [e.message?.slice(0, 40)] } }
    }))
    results.forEach(r => { per.push(r); total += Math.max(r.n, 0) })
  }
  console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s, total ticks: ${total}`)
  per.forEach(r => console.log(`  ${r.s}: ${r.n} -> ${r.ids.join(',')}`))
  process.exit(0)
}
main()
