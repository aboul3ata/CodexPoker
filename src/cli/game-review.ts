import fs from 'node:fs'
import path from 'node:path'
import type { LatestHandPacket } from '../shared/contracts'
import { buildReviewBrief, buildReviewMessage } from '../shared/review-copy'
import { parseArgs, postApi } from './client'

const args = parseArgs(process.argv.slice(2))
const filePath = path.resolve(String(args.file ?? 'data/bridge/latest-hand.json'))
const shouldPost = Boolean(args.post)

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
  suggestedMessage
}

if (!shouldPost) {
  console.log(JSON.stringify(output, null, 2))
  process.exit(0)
}

postApi('/api/say', { seat: 'uplift', message: suggestedMessage })
  .then((result) => {
    console.log(JSON.stringify({ ...output, posted: true, state: result.state }, null, 2))
  })
  .catch((error: Error & { code?: string }) => {
    console.error(`${error.code ?? 'error'}: ${error.message}`)
    const exits: Record<string, number> = {
      invalid_action: 2,
      stale_turn: 3,
      wrong_seat: 4,
      not_to_act: 5,
      malformed_command: 6,
      storage_unavailable: 7
    }
    process.exit(exits[error.code ?? ''] ?? 1)
  })
