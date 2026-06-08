import fs from 'node:fs'
import path from 'node:path'
import type { LatestHandPacket } from '../shared/contracts'
import { buildReviewBrief, buildReviewMessage } from '../shared/review-copy'
import { parseArgs } from './client'

const args = parseArgs(process.argv.slice(2))
const filePath = path.resolve(String(args.file ?? 'data/bridge/latest-hand.json'))

if (!fs.existsSync(filePath)) {
  console.error(`No completed hand packet found at ${filePath}. Finish a hand first.`)
  process.exit(6)
}

const packet = JSON.parse(fs.readFileSync(filePath, 'utf8')) as LatestHandPacket
const suggestedMessage = args.message ? String(args.message) : buildReviewMessage(packet)
const output = {
  ok: true,
  handId: packet.handId,
  reviewPrompt: packet.reviewPrompt,
  brief: buildReviewBrief(packet),
  suggestedMessage,
  protocol: {
    destination: 'Codex chat',
    privateInfo: 'Use showdown cards for review only; do not post review text into the preview UI.'
  }
}

console.log(JSON.stringify(output, null, 2))
