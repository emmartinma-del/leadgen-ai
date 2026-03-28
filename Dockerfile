FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Persistent data directory
RUN mkdir -p /data

ENV DATABASE_PATH=/data/leadgen.db
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
