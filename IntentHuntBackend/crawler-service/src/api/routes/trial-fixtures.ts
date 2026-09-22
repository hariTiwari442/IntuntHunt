/**
 * Fixture leads for local UI testing (MOCK_PIPELINE=true).
 *
 * These are written straight into the DB as an already-completed scan, so no
 * SearchRun is queued. That matters for more than speed: the job queue is the
 * shared production database, and the production worker polls it constantly —
 * so anything queued locally gets claimed and charged for upstream, mock APIs
 * or not.
 *
 * The spread is deliberate, to exercise every state the results screen has:
 * two strong leads above the fold, a mid-range tail behind the blur, and a
 * competitor row that should be filtered out entirely.
 */

export interface FixtureLead {
  url:                string;
  platform:           "reddit" | "linkedin" | "twitter";
  subreddit:          string | null;
  title:              string;
  content:            string;
  author:             string | null;
  postScore:          number;
  commentCount:       number;
  intentScore:        number;
  leadType:           string;
  reasoning:          string;
  replyOpportunity:   string;
  suggestedAngle:     string;
  isCompetitorThread: boolean;
}

export const FIXTURE_LEADS: FixtureLead[] = [
  {
    url: "https://www.reddit.com/r/sales/comments/mockfx1/what_do_you_use_to_get_cards_into_your_crm/",
    platform: "reddit", subreddit: "sales",
    title: "What do you use to get business cards into your CRM?",
    content:
      "Just got back from a trade show with about 200 cards. Last year I typed them all in by hand and it took a full weekend. There has to be something better — what are people actually using? Budget isn't a huge deal, I just want it to be accurate.",
    author: "u/mock_buyer_1", postScore: 64, commentCount: 23,
    intentScore: 92, leadType: "hot",
    reasoning: "Author is explicitly asking for a tool in this exact category and has budget.",
    replyOpportunity: "comment",
    suggestedAngle: "Answer the accuracy question directly, then mention how it syncs to CRM.",
    isCompetitorThread: false,
  },
  {
    url: "https://www.reddit.com/r/smallbusiness/comments/mockfx2/camcard_alternative_that_actually_works/",
    platform: "reddit", subreddit: "smallbusiness",
    title: "Anyone found a good CamCard alternative?",
    content:
      "CamCard just raised their prices and the OCR has been getting worse on non-standard layouts. Looking for something that handles odd card designs and exports cleanly. What's everyone switched to?",
    author: "u/mock_buyer_3", postScore: 41, commentCount: 17,
    intentScore: 88, leadType: "hot",
    reasoning: "Actively switching away from a named competitor over price and accuracy.",
    replyOpportunity: "comment",
    suggestedAngle: "Lead with how it handles non-standard layouts, since that's their actual blocker.",
    isCompetitorThread: false,
  },
  {
    url: "https://www.linkedin.com/posts/mockfx3-trade-show-follow-up-activity-7400000000000-abcd",
    platform: "linkedin", subreddit: null,
    title: "Three days of conversations, and a stack of cards nobody followed up on",
    content:
      "Every exhibitor I spoke to last week had the same story. You collect cards for three days, get back to the office, and the pile just sits there. By the time anyone gets to it the conversation has gone cold. The capture step is the easy part to fix.",
    author: "Mock Exhibitor", postScore: 112, commentCount: 14,
    intentScore: 74, leadType: "warm",
    reasoning: "Describes the exact pain in detail but hasn't asked for a tool.",
    replyOpportunity: "comment",
    suggestedAngle: "Agree with the diagnosis, then note how fast capture changes follow-up rates.",
    isCompetitorThread: false,
  },
  {
    url: "https://www.reddit.com/r/Entrepreneur/comments/mockfx4/cheapest_way_to_digitise_conference_cards/",
    platform: "reddit", subreddit: "Entrepreneur",
    title: "Cheapest way to digitise a stack of conference cards?",
    content:
      "Solo founder, went to two events this month and now have maybe 80 cards. Don't want to pay enterprise pricing. Is there something decent that doesn't cost a fortune?",
    author: "u/mock_buyer_4", postScore: 28, commentCount: 9,
    intentScore: 71, leadType: "warm",
    reasoning: "Clear need with a stated budget constraint — price-sensitive but in-market.",
    replyOpportunity: "comment",
    suggestedAngle: "Address the cost question honestly before mentioning the product.",
    isCompetitorThread: false,
  },
  {
    url: "https://x.com/mockuser/status/1900000000005",
    platform: "twitter", subreddit: null,
    title: "Still typing contacts in by hand after every event like it's 2010",
    content:
      "Still typing contacts in by hand after every event like it's 2010. There must be a better way to do this that doesn't involve a weekend of data entry.",
    author: null, postScore: 33, commentCount: 6,
    intentScore: 68, leadType: "warm",
    reasoning: "Venting the exact pain the product solves, receptive to a suggestion.",
    replyOpportunity: "comment",
    suggestedAngle: "Short, casual reply — one line about scanning on the spot.",
    isCompetitorThread: false,
  },
  {
    url: "https://www.reddit.com/r/marketing/comments/mockfx6/trade_show_booth_design_advice/",
    platform: "reddit", subreddit: "marketing",
    title: "Best practices for trade show booth design?",
    content:
      "Planning our first booth next quarter. Looking for advice on layout, signage and giveaways that actually get people to stop and talk.",
    author: "u/mock_noise_1", postScore: 19, commentCount: 11,
    intentScore: 45, leadType: "possible",
    reasoning: "Adjacent topic — trade shows, but no signal about capturing contacts.",
    replyOpportunity: "comment",
    suggestedAngle: "Only worth a reply if the thread turns to lead capture.",
    isCompetitorThread: false,
  },
  {
    url: "https://www.linkedin.com/posts/mockfx7-announcing-our-scanner-activity-7400000000007-wxyz",
    platform: "linkedin", subreddit: null,
    title: "We're excited to announce our brand new card scanner",
    content:
      "Introducing our new app! It's the fastest and most accurate card scanner available anywhere — perfect for conferences, networking events, or finally tackling that pile of cards on your desk. Available now on iOS and Android.",
    author: "Mock Competitor Inc", postScore: 87, commentCount: 3,
    intentScore: 5, leadType: "not_a_lead",
    reasoning: "Corporate announcement of a competing product, not a buyer.",
    replyOpportunity: "none",
    suggestedAngle: "",
    isCompetitorThread: true,
  },
];
