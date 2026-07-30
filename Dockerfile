FROM node:22.23.1-alpine AS deps
# Keep the project root distinct from the app/ route directory. A /app root
# makes production module identities collide for app/layout.tsx and app/app/layout.tsx.
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY scripts/deploy/bake-runtime-env.mjs ./scripts/deploy/bake-runtime-env.mjs
COPY scripts/generate/generate-client-if-schema.mjs ./scripts/generate/generate-client-if-schema.mjs
COPY scripts/generate/root-postinstall.mjs ./scripts/generate/root-postinstall.mjs
# Pin npm to the version that generated package-lock.json so `npm ci` resolves the
# identical dependency tree (the base image's bundled npm can differ and reject the lockfile).
RUN npm install -g npm@10.9.3 && npm ci
# Self-contained prisma CLI tree for the runner image: platform deploy hooks (Railway
# preDeployCommand, Fly release_command) execute in the final image, where copying only
# node_modules/prisma and node_modules/@prisma is not enough - the CLI's transitive
# dependencies (effect, c12, ...) live at the node_modules root. Versions mirror the
# lockfile-resolved ones so the bundle cannot drift from the app.
RUN npm install --prefix /migrate-cli --no-save --no-audit --no-fund \
  prisma@"$(node -p "require('./node_modules/prisma/package.json').version")" \
  @prisma/config@"$(node -p "require('./node_modules/@prisma/config/package.json').version")"
# Postgres driver closure for the seed scripts (prisma/seed.ts, scripts/admin/
# seed-instance-admin.ts): the Next standalone trace does not surface pg's transitive
# dependencies (postgres-array, ...) at the node_modules root, so the seeds cannot resolve
# them in the runner image. Same lockfile-pinned-prefix pattern as migrate-cli above; the
# closure is merged into the runner's node_modules, where ESM resolution from
# /workspace/prisma/seed.ts finds it.
RUN npm install --prefix /seed-cli --no-save --no-audit --no-fund \
  pg@"$(node -p "require('./node_modules/pg/package.json').version")" \
  @prisma/adapter-pg@"$(node -p "require('./node_modules/@prisma/adapter-pg/package.json').version")"
# Blocking data migrations can use application libraries before their schema
# contract is applied. The standalone trace does not include the current
# migration dependency closure, so carry the exact lockfile-resolved packages.
RUN npm install --prefix /public-id-cli --no-save --no-audit --no-fund \
  @paralleldrive/cuid2@"$(node -p "require('./node_modules/@paralleldrive/cuid2/package.json').version")" \
  @noble/hashes@"$(node -p "require('./node_modules/@noble/hashes/package.json').version")" \
  bignumber.js@"$(node -p "require('./node_modules/bignumber.js/package.json').version")" \
  error-causes@"$(node -p "require('./node_modules/error-causes/package.json').version")"

FROM node:22.23.1-alpine AS builder
WORKDIR /workspace
ARG NEXT_PUBLIC_DOCS_URL=https://bisibility.com/docs
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .
RUN npm run db:download-rds-ca && npx prisma generate && npm run build

FROM builder AS migrate
ENV NODE_ENV=production

USER node

CMD ["npm", "run", "db:migrate"]

FROM node:22.23.1-alpine AS runner
WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /workspace/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/.next/static ./.next/static
# Next standalone's package manifest does not retain operator scripts. Railway
# and Fly invoke npm run db:migrate in this image, so keep the repository
# manifest that defines the frozen entrypoint.
COPY --from=builder --chown=nextjs:nodejs /workspace/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /workspace/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /workspace/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=nextjs:nodejs /migrate-cli/node_modules ./migrate-cli/node_modules
# The Prisma 7 CLI loads prisma.config.ts, whose imports (prisma/config -> effect,
# dotenv/config) resolve relative to the CONFIG FILE location. Keeping a copy of the
# config and schema inside migrate-cli/ makes them resolve from the bundle's own
# node_modules; the deploy hooks pass --config migrate-cli/prisma.config.ts.
COPY --from=builder --chown=nextjs:nodejs /workspace/prisma.config.ts ./migrate-cli/prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /workspace/prisma ./migrate-cli/prisma
COPY --from=builder --chown=nextjs:nodejs /workspace/prisma ./prisma
# Make the seed scripts runnable in THIS image: prisma/seed.ts imports the lib/ tree and
# the @prisma/adapter-pg driver stack, and the scripts/admin utilities import pg.
# The standalone trace ships neither the lib/ sources nor pg's transitive dependencies at
# the node_modules root, so both are added explicitly: the /seed-cli closure (lockfile-
# pinned in the deps stage) merges into node_modules, lib/ and the admin script come from
# the builder. Verified: without the closure the demo seed fails on
# "Cannot find package 'postgres-array'".
COPY --from=deps --chown=nextjs:nodejs /seed-cli/node_modules ./node_modules
COPY --from=deps --chown=nextjs:nodejs /public-id-cli/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /workspace/lib ./lib
# Railway and Fly execute db:migrate in this final image. The wrapper selects
# the packaged Prisma CLI/config above, applies the full migration tree, then
# runs the generic data-migration registry.
COPY --from=builder --chown=nextjs:nodejs /workspace/scripts/deploy/migrate.ts ./scripts/deploy/migrate.ts
COPY --from=builder --chown=nextjs:nodejs /workspace/scripts/data-migrations ./scripts/data-migrations
COPY --from=builder --chown=nextjs:nodejs /workspace/scripts/ops/public-id-write-gate.ts ./scripts/ops/public-id-write-gate.ts
COPY --from=builder --chown=nextjs:nodejs /workspace/scripts/ops/public-id-v3-contract-cleanup.ts ./scripts/ops/public-id-v3-contract-cleanup.ts
COPY --from=builder --chown=nextjs:nodejs /workspace/scripts/admin/seed-instance-admin.ts ./scripts/admin/seed-instance-admin.ts
COPY --from=builder --chown=nextjs:nodejs /workspace/scripts/admin/reset-two-factor.ts ./scripts/admin/reset-two-factor.ts

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
