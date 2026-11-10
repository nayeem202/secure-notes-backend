FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node . .
USER node
ENV HOST=0.0.0.0 PORT=3000 AUTO_INDEX=false SERVE_FRONTEND=false
EXPOSE 3000
CMD ["node", "server.js"]
