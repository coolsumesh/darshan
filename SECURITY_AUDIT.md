# Security Audit Report

## Executive Summary
The `darshan` repository has a solid foundation for database safety (parameterized queries) and secret management (git-ignored `.env`). However, the API is currently **completely open** with no authentication, permissive CORS, and missing security headers. These issues should be addressed before any production deployment.

## Critical Vulnerabilities

### 1. Missing Authentication (High Severity)
**Location:** `apps/api/src/index.ts`
**Issue:** The API server has no authentication middleware. All endpoints, including `/api/v1/ops/rate-limits`, are publicly accessible.
**Risk:** Unauthorized users can query operational data and potentially abuse future endpoints.
**Recommendation:** Implement an authentication guard (e.g., `@fastify/jwt` or a simple API key check for MVP) and apply it globally or per-route.

### 2. Insecure CORS Configuration (High Severity)
**Location:** `apps/api/src/index.ts`
**Issue:** `origin: true` allows any domain to make cross-origin requests to your API.
**Risk:** Malicious websites can make requests to your API on behalf of users (CSRF-like scenarios, though less critical without cookie auth, still bad practice).
**Recommendation:** Set strict `origin` limits in production (e.g., only allow `localhost:3000` in dev, specific domains in prod).

### 3. Missing Rate Limiting enforcement (Medium Severity)
**Location:** `apps/api/src/index.ts`
**Issue:** While there is code to *read* rate limit events (`opsRateLimits.ts`), there is no middleware *enforcing* limits on incoming requests.
**Risk:** The API is vulnerable to Denial of Service (DoS) attacks or brute-force attempts.
**Recommendation:** Install and register `@fastify/rate-limit`.

## Other Issues

### 4. Missing Security Headers
**Location:** Backend (`index.ts`) and Frontend (`next.config.ts`)
**Issue:**
- Backend: No `helmet` middleware.
- Frontend: No `Content-Security-Policy` or other headers in `next.config.ts`.
**Risk:** Increases susceptibility to XSS, clickjacking, and other browser-based attacks.
**Recommendation:**
- Backend: Use `@fastify/helmet`.
- Frontend: Configure headers in `next.config.ts`.

### 5. Information Disclosure
**Location:** `GET /api/v1/ops/rate-limits`
**Issue:** This endpoint exposes internal audit log metadata to the public (due to missing auth).
**Risk:** Leaks internal error details (provider names, models, error types) which could aid an attacker in mapping the system.
**Recommendation:** Secure this endpoint immediately behind Admin auth.

## Positive Findings
- **SQL Injection:** Not vulnerable. The codebase consistently uses `pg` with parameterized queries (`$1, $2`).
- **Secrets:** `.env` files are correctly excluded from git.
- **Project Structure:** Clear separation of concerns helps with security maintenance.
