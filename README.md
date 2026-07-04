# Terminal 1 — Mock server (always required for mock mode)

cd IntentHuntBackend/mock-server && npm start

# Terminal 2 — Keyword service in mock mode

cd IntentHuntBackend/keyword-service && npm run dev:mock

# Terminal 3 — Crawler API in mock mode

cd IntentHuntBackend/crawler-service && npm run api:mock

# Terminal 4 — Crawler Worker in mock mode

cd IntentHuntBackend/crawler-service && npm run worker:mock

# Terminal 5 — Main backend (no mock needed)

cd IntentHuntBackend/main-backend && npm run dev

# Terminal 6 — Frontend

cd IntentHuntFrontEnd && npm run dev

To run in REAL mode (uses real API keys, costs money):

Same commands but drop the :mock suffix:

npm run dev (keyword-service)
npm run api (crawler-service)
npm run worker (crawler-service)
Don't start the mock serve
