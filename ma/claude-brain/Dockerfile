# Michael and Associates fork: Claude Brain's container. Railway builds it from ma-main (root ma/claude-brain).
# Node 22.18 or later runs the TypeScript sources as they are. The Agent SDK brings its own Claude Code binary for
# Linux, so nothing else is installed.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

# Conversations (the agent's session files, and which conversation each belongs to) live on the service's volume.
ENV CLAUDE_BRAIN_DATA_DIR=/data
EXPOSE 8080

CMD ["node", "src/server.ts"]
