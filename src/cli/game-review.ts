import fs from 'node:fs'
import path from 'node:path'
import type { LatestHandPacket } from '../shared/contracts'
import { buildAcceptedReviewMessage, buildCoachingPlan, buildReviewBrief, buildReviewMessage } from '../shared/review-copy'
import { parseArgs } from './client'

const args = parseArgs(process.argv.slice(2))
const filePath = path.resolve(String(args.file ?? 'data/bridge/latest-hand.json'))
const mode = args.mode === 'accepted' ? 'accepted' : 'offer'

if (!fs.existsSync(filePath)) {
  console.error(`No completed hand packet found at ${filePath}. Finish a hand first.`)
  process.exit(6)
}

const packet = JSON.parse(fs.readFileSync(filePath, 'utf8')) as LatestHandPacket
const reviewOffer = buildReviewMessage(packet)
const acceptedReview = buildAcceptedReviewMessage(packet)
const suggestedMessage = args.message ? String(args.message) : mode === 'accepted' ? acceptedReview : reviewOffer
const output = {
  ok: true,
  handId: packet.handId,
  mode,
  reviewPrompt: packet.reviewPrompt,
  brief: buildReviewBrief(packet),
  coachingPlan: buildCoachingPlan(packet),
  reviewOffer,
  acceptedReview,
  suggestedMessage,
  protocol: {
    destination: 'Codex chat',
    reviewFlow: 'Default mode asks Ali whether they want the review. Use --mode accepted only after Ali says yes.',
    privateInfo: 'Use showdown cards for review only; do not post review text into the preview UI.'
  }
}

console.log(JSON.stringify(output, null, 2))
