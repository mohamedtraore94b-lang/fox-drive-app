FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY migrations ./migrations
COPY public ./public
EXPOSE 8080
USER node
CMD ["node", "server/main.ts"]
