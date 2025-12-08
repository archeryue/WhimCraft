---
name: ship
description: Deploy WhimCraft to production on Google Cloud Run. Use when the user wants to "ship", "deploy", "push to production", "go live", "release", or "publish" the latest code.
---

# Ship Skill - Deploy WhimCraft to Production

Use this skill to deploy the latest code to Google Cloud Run.

## 🔴 Pre-Flight Checklist (REQUIRED)

Before deploying, you MUST verify all checks pass:

```bash
# 1. Build check (TypeScript errors)
npm run build

# 2. Unit tests (307 tests)
npx jest

# 3. E2E tests (72 tests) - Run if user-facing changes were made
npm run test:e2e:fast
```

**All tests must pass before proceeding. Never deploy with failing tests.**

## Git Workflow

WhimCraft uses a two-branch workflow: `develop` → `main`

### Check Current Branch & Status

```bash
# Check current branch
git branch --show-current

# Check for uncommitted changes
git status

# Check if we're ahead of remote
git status -sb
```

### If on `develop` Branch

```bash
# 1. Commit any pending changes
git add .
git commit -m "your message"

# 2. Push to develop
git push origin develop

# 3. Wait for CI to pass (5 automated checks)
gh run list --branch develop --limit 1

# 4. Create PR to main
gh pr create --base main --head develop --title "Release: description" --body "Summary of changes"

# 5. Merge PR (after CI passes)
gh pr merge --merge
```

### If Already on `main` Branch

```bash
# Ensure main is up to date
git pull origin main
```

## Deploy Command

Deploy using Cloud Build (recommended method):

```bash
# Get current commit hash
SHORT_SHA=$(git rev-parse --short HEAD)

# Deploy to Cloud Run
gcloud builds submit --config cloudbuild.yaml --project=archerchat-3d462 --substitutions=SHORT_SHA=$SHORT_SHA
```

**Expected output**: Build completes in ~3-5 minutes. Look for:
- `✓ Build successful`
- `Service [archerchat] revision [archerchat-xxxxx] has been deployed`

## Environment Variable Verification (REQUIRED)

Before deploying, verify all required environment variables are configured in Cloud Run.

### 1. Read Required Variables from `.env.local.example`

```bash
# Extract env var names from .env.local.example (excluding comments and empty lines)
grep -E '^[A-Z_]+=.*' .env.local.example | cut -d'=' -f1
```

### 2. Get Currently Configured Variables in Cloud Run

```bash
gcloud run services describe archerchat \
  --region us-central1 \
  --project archerchat-3d462 \
  --format="value(spec.template.spec.containers[0].env.name)"
```

### 3. Compare and Identify Missing Variables

Compare the two lists. Any variable in `.env.local.example` that is NOT in Cloud Run needs to be added.

**Required variables** (non-optional):
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`
- `ADMIN_EMAIL`

**Feature variables** (add if features are enabled):
- Web search: `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`, `JINA_API_KEY`
- R2 storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`

### 4. Add Missing Variables

If any required variables are missing, read their values from `.env.local` and add them:

```bash
# Read value from .env.local
VALUE=$(grep '^VARIABLE_NAME=' .env.local | cut -d'=' -f2-)

# Add to Cloud Run
gcloud run services update archerchat \
  --region us-central1 \
  --project archerchat-3d462 \
  --update-env-vars "VARIABLE_NAME=$VALUE"
```

**⚠️ SECURITY**: Never log or display the actual secret values. Only confirm that variables were added.

---

## Post-Deployment Verification (ALWAYS DO THIS)

### ⚠️ Important: Wait for Revision to Appear

New revisions may not appear immediately after deployment. Always verify the expected revision exists before checking traffic.

### 1. Get Expected Revision ID

The deploy output shows the revision name. It follows the pattern `archerchat-XXXXX` where XXXXX includes the SHORT_SHA or a unique suffix.

```bash
# Get current commit hash (this was used in deployment)
SHORT_SHA=$(git rev-parse --short HEAD)
echo "Deployed commit: $SHORT_SHA"
```

### 2. Wait for and Verify New Revision

Poll until the new revision appears (may take 10-30 seconds):

```bash
# List revisions and look for one created in the last few minutes
gcloud run revisions list \
  --service=archerchat \
  --region=us-central1 \
  --project=archerchat-3d462 \
  --limit=5 \
  --format="table(metadata.name,status.conditions[0].status,metadata.creationTimestamp)"
```

**Expected**:
- A new revision appears with a recent timestamp (within last 1-2 minutes)
- STATUS shows `True`

**If the new revision doesn't appear**, wait 15-30 seconds and check again.

### 3. Verify Image Tag Matches Deployed Commit

```bash
SHORT_SHA=$(git rev-parse --short HEAD)
gcloud artifacts docker images describe \
  us-central1-docker.pkg.dev/archerchat-3d462/cloud-run-source-deploy/archerchat:$SHORT_SHA \
  --format="value(image_summary.digest)"
```

**Expected**: Returns a valid digest (sha256:...)

### 4. Check Traffic Routing Points to NEW Revision

```bash
gcloud run services describe archerchat \
  --region us-central1 \
  --project archerchat-3d462 \
  --format="value(status.traffic)"
```

**Expected**: 100% traffic to the NEW revision (the one you just saw in step 2)

**⚠️ CRITICAL**: Compare the revision name in traffic output with the new revision from step 2. They MUST match! If traffic points to an older revision, manually update it (see Troubleshooting).

### 5. Check Recent Logs for Errors

```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=archerchat AND severity>=ERROR" \
  --limit=10 \
  --project=archerchat-3d462 \
  --format="table(timestamp,textPayload)"
```

**Expected**: No critical errors in recent logs

### 6. Quick Health Check

Test the production URL is responding:

```bash
# Get the service URL
gcloud run services describe archerchat \
  --region us-central1 \
  --project archerchat-3d462 \
  --format="value(status.url)"
```

## Post-Deployment Checklist

After successful deployment, verify:

- [ ] New revision created and healthy (STATUS=True)
- [ ] Traffic routed 100% to new revision
- [ ] Image tag matches deployed commit ($SHORT_SHA)
- [ ] No errors in recent logs
- [ ] Production URL responds

## Troubleshooting

### Build Fails

```bash
# Check build logs
gcloud builds list --project=archerchat-3d462 --limit=1
gcloud builds describe BUILD_ID --project=archerchat-3d462
```

### Revision Not Serving Traffic

```bash
# Manually route traffic to latest revision
gcloud run services update-traffic archerchat \
  --to-latest \
  --region=us-central1 \
  --project=archerchat-3d462
```

### Container Fails to Start

```bash
# Check detailed logs
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=archerchat" \
  --limit=50 \
  --project=archerchat-3d462
```

### Authentication Issues After Deploy

If OAuth fails after deployment:
1. Verify `NEXTAUTH_URL` matches the production URL
2. Check Google OAuth redirect URIs include the production URL
3. See `docs/DEPLOYMENT.md` for detailed troubleshooting

## Quick Reference

| Step | Command |
|------|---------|
| Build check | `npm run build` |
| Unit tests | `npx jest` |
| E2E tests | `npm run test:e2e:fast` |
| Deploy | `gcloud builds submit --config cloudbuild.yaml --project=archerchat-3d462 --substitutions=SHORT_SHA=$(git rev-parse --short HEAD)` |
| Check revisions | `gcloud run revisions list --service=archerchat --region=us-central1 --project=archerchat-3d462 --limit=3` |
| Check logs | `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=archerchat AND severity>=ERROR" --limit=10 --project=archerchat-3d462` |

## Configuration

- **Project**: `archerchat-3d462`
- **Service**: `archerchat`
- **Region**: `us-central1`
- **Image Registry**: `us-central1-docker.pkg.dev/archerchat-3d462/cloud-run-source-deploy/archerchat`

## Cost Reminder

Deployment itself is low-cost. Running costs:
- Cloud Run: $5-10/month (scales to zero when idle)
- Build: ~$0.003 per build minute
- Total estimated: $8-18/month for family use
