FROM node:20-slim AS build
WORKDIR /app
COPY prisma ./prisma
COPY src/lib ./src/lib
COPY voice-agent-service ./voice-agent-service
WORKDIR /app/voice-agent-service
RUN npm ci
RUN npm run db:generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app/voice-agent-service
ENV NODE_ENV=production
COPY --from=build /app/voice-agent-service/node_modules ./node_modules
COPY --from=build /app/voice-agent-service/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
