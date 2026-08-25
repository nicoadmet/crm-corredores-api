FROM node:22-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN npm ci

COPY . .

EXPOSE 4000

CMD ["npm", "start"]