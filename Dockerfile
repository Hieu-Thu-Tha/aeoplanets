# syntax=docker/dockerfile:1.7

ARG NODE_BASE_IMAGE=node:22.23.2-alpine3.23@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
FROM ${NODE_BASE_IMAGE} AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build \
    && npm prune --omit=dev --no-audit --no-fund \
    && node -e "require.resolve('pg')"

FROM ${NODE_BASE_IMAGE} AS runtime
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5000
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN rm -f /app/package-lock.json
USER node
EXPOSE 5000
CMD ["node", "dist/index.js"]
