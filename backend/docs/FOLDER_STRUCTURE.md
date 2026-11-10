# Backend — Folder Structure (layered architecture)

```
backend/
├── server.js              # thin entry → src/server.js (keeps npm scripts stable)
├── scripts/seed.js        # demo users / topics / graphs / activity
├── docs/                  # API_DOCS, ENV_SETUP, this file
└── src/
    ├── server.js          # listen + connectDB
    ├── app.js             # express wiring (helmet, cors, morgan, rate-limit, routes)
    ├── config/            # db.js (Mongo + memory fallback), env.js
    ├── constants/         # roles, categories, activityTypes
    ├── models/            # User, Topic, KnowledgeGraph, Node, LearningPath, UserActivity
    ├── repositories/      # Base + per-model query wrappers (no HTTP, no business rules)
    ├── services/          # business logic
    │   ├── auth.service, topic.service, graph.service, user.service
    │   ├── analytics.service, activity.service, TopicClassificationService
    │   ├── wikipedia.service, youtube.service
    │   └── ai/GeminiService.js   # mock today, GEMINI_API_KEY tomorrow
    ├── controllers/       # thin HTTP mapping → services → { success, message, data }
    ├── routes/            # auth, users, topics, graphs, analytics, ai
    ├── middleware/        # authMiddleware+authorize, validate, errorHandler,
    │                      # requireDB, sanitize, activityTracker
    ├── validators/        # rules.js (express-validator) + schemas.js (zod)
    ├── utils/             # response, ApiError, jwt, asyncHandler, pagination
    └── jobs/              # analytics.job.js (rollup placeholder)
```

Rules: controllers never touch Mongoose directly (via services);
services never touch `req/res` (via repositories + models);
every major action calls `activity.service.track(...)`.
