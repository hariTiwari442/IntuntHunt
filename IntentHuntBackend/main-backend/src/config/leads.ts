/**
 * Lead score thresholds — the single definition for this service.
 *
 * Every count this API hands to the UI has to mean the same thing the UI
 * means by it: leads worth showing. The dashboard total, the product cards
 * and the inbox sidebar all derive from counts computed here, so if this
 * drifts from the frontend's threshold the app quietly reports two different
 * realities — a card claiming 31 leads over an inbox showing none.
 *
 * ⚠ Two other copies exist outside this service and cannot import this file,
 * because they're separate deployables:
 *   - IntentHuntFrontEnd  src/config/leads.ts
 *   - crawler-service     src/pipeline/step4-5-process-lead.ts (leadTypeFromScore)
 * Change one, change all three.
 */

/** At or above this, a lead is shown to the user. */
export const HOT_LEAD_SCORE = 80;
