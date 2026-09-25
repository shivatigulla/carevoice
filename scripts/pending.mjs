// Placeholder for npm scripts whose implementation lands in a later phase (see docs/PROGRESS.md).
//   node scripts/pending.mjs <phase> <script-name>
const [phase, name] = process.argv.slice(2)
console.error(`\`npm run ${name}\` is implemented in Phase ${phase}. See docs/PROGRESS.md.`)
process.exit(1)
