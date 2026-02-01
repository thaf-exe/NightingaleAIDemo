# NightingaleAIDemo
backend structure explained:

Folder	Purpose
routes/	API endpoints (URLs the frontend calls)
middleware/	Code that runs BEFORE route handlers (auth checks, logging)
services/	Business logic (LLM calls, risk calculation)
models/	Database queries and data shapes
types/	TypeScript type definitions
utils/	Helper functions (PHI redaction, hashing)