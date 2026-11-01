FROM node:24-alpine3.22

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
