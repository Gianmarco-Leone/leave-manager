FROM node:20-alpine

# Installa dipendenze native per better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copia package files e installa dipendenze
COPY package*.json ./
RUN npm install --omit=dev

# Copia sorgenti
COPY . .

# Crea la directory dati
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "app.js"]
